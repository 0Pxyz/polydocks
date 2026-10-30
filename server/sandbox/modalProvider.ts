import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config";

export interface SandboxExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SandboxStatus {
  state: "running" | "finished" | "unknown";
  exitCode: number | null;
}

const APP_NAME = "polydocks-sandboxes";
const IMAGE_REF = "node:22-slim";
// The workspace volume IS the workdir: everything the agent writes under
// /repo lives on the per-workspace Volume, so files survive sandbox
// replacement. Nothing else in the container filesystem is persistent.
const WORKDIR = "/repo";
const SERVE_PORTS = [3000, 5173, 8080];
const MAX_OUTPUT_CHARS = 32_000;

function tomlConfigured(): boolean {
  try {
    const p = process.env.MODAL_CONFIG_PATH || path.join(os.homedir(), ".modal.toml");
    const raw = fs.readFileSync(p, "utf-8");
    return raw.includes("token_id") && raw.includes("token_secret");
  } catch {
    return false;
  }
}

/** Real credentials present (env first, ~/.modal.toml fallback — same order as the SDK). */
export function isModalConfigured(): boolean {
  if (config.MODAL_TOKEN_ID.trim() && config.MODAL_TOKEN_SECRET.trim()) return true;
  return tomlConfigured();
}

export function modalNotConfiguredError(): string {
  return (
    "Modal is not configured: set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET in the server env " +
    "or run `modal setup` (writes ~/.modal.toml). Sandbox execution is disabled until then; " +
    "conversational turns and workspace tools keep working."
  );
}

async function getClient(): Promise<any> {
  const { ModalClient } = await import("modal");
  return new ModalClient();
}

async function getApp(modal: any): Promise<any> {
  return await modal.apps.fromName(APP_NAME, { createIfMissing: true });
}

function imageFor(modal: any): any {
  return modal.images.fromRegistry(IMAGE_REF);
}

export interface EnsureOptions {
  cpu?: number;
  memoryMiB?: number;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  /** Previously stored sandbox id for this workspace (from the store). */
  knownSandboxId?: string;
}

/** Reuse the workspace sandbox by id, or create a fresh one on the same volume. */
export async function ensureSandbox(
  workspaceId: string,
  sandboxName: string,
  volumeName: string,
  opts: EnsureOptions = {}
): Promise<{ sandbox: any; reused: boolean; volume: any }> {
  const modal = await getClient();
  const app = await getApp(modal);
  const volume = await modal.volumes.fromName(volumeName, { createIfMissing: true });

  // 1. Try the stored sandbox id first; fromId works without a deployed app.
  let sandbox: any = null;
  let reused = false;
  if (opts.knownSandboxId) {
    try {
      const candidate = await modal.sandboxes.fromId(opts.knownSandboxId);
      const code = await candidate.poll();
      if (code === null) {
        sandbox = candidate;
        reused = true;
      }
    } catch {
      sandbox = null;
    }
  }

  if (!sandbox) {
    sandbox = await createWithNameRetry();
  }
  return { sandbox, reused, volume };

  async function createNamedOnce(): Promise<any> {
    return await modal.sandboxes.create(app, imageFor(modal), {
      name: sandboxName,
      volumes: { [WORKDIR]: volume },
      workdir: WORKDIR,
      cpu: opts.cpu ?? 0.5,
      memoryMiB: opts.memoryMiB ?? 512,
      timeoutMs: opts.timeoutMs ?? 30 * 60 * 1000,
      idleTimeoutMs: opts.idleTimeoutMs ?? 10 * 60 * 1000,
      encryptedPorts: SERVE_PORTS,
      tags: { workspace: workspaceId.slice(0, 60), "managed-by": "polydocks" },
    });
  }

  async function createWithNameRetry(): Promise<any> {
    // Modal releases a terminated sandbox's name asynchronously: after a
    // terminate, the first recreate can still hit AlreadyExists. Adopt the
    // running adoptee when there is one, else retry briefly, else rethrow.
    let lastErr: any = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await createNamedOnce();
      } catch (err: any) {
        lastErr = err;
        if (!isAlreadyExists(err)) throw err;
        const adoptee = await adoptRunningByTag(modal, app, workspaceId);
        if (adoptee) {
          reused = true;
          return adoptee;
        }
        await new Promise((res) => setTimeout(res, 3000));
      }
    }
    throw lastErr;
  }
}

function isAlreadyExists(err: any): boolean {
  const msg = String(err?.message || err || "");
  return err?.constructor?.name === "AlreadyExistsError" || msg.includes("already in use");
}

async function adoptRunningByTag(modal: any, app: any, workspaceId: string): Promise<any | null> {
  try {
    const appId = app?.appId || app?.app_id;
    const params: any = { tags: { workspace: workspaceId.slice(0, 60) } };
    if (appId) params.appId = appId;
    for await (const candidate of modal.sandboxes.list(params)) {
      try {
        const code = await candidate.poll();
        if (code === null) return candidate;
      } catch {
        // Keep looking.
      }
    }
  } catch {
    // List unavailable — caller rethrows the original error.
  }
  return null;
}

export async function execInSandbox(
  sandbox: any,
  command: string[],
  opts: { timeoutMs?: number; workdir?: string } = {}
): Promise<SandboxExecResult> {
  const start = Date.now();
  const proc = await sandbox.exec(command, {
    timeoutMs: opts.timeoutMs ?? 120_000,
    workdir: opts.workdir || WORKDIR,
  });
  const exitCode = await proc.wait();
  const [stdout, stderr] = await Promise.all([
    proc.stdout.readText().catch(() => ""),
    proc.stderr.readText().catch(() => ""),
  ]);
  return {
    exitCode: typeof exitCode === "number" ? exitCode : -1,
    stdout: truncate(stdout),
    stderr: truncate(stderr),
    durationMs: Date.now() - start,
  };
}

export async function sandboxStatus(sandbox: any): Promise<SandboxStatus> {
  try {
    const code = await sandbox.poll();
    if (code === null) return { state: "running", exitCode: null };
    return { state: "finished", exitCode: typeof code === "number" ? code : -1 };
  } catch {
    return { state: "unknown", exitCode: null };
  }
}

export async function terminateSandbox(sandbox: any): Promise<number | null> {
  try {
    const code = await sandbox.terminate({ wait: true });
    return typeof code === "number" ? code : null;
  } catch {
    try {
      await sandbox.terminate();
    } catch {
      // Already gone.
    }
    return null;
  }
}

export async function previewUrlFor(sandbox: any, port: number): Promise<string | null> {
  try {
    const tunnels = await sandbox.tunnels();
    const t = tunnels?.[port];
    return typeof t?.url === "string" ? t.url : null;
  } catch {
    return null;
  }
}

/** Block until a TCP port answers inside the sandbox (bounded, no busy spin). */
export async function waitForPort(sandbox: any, port: number, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await execInSandbox(
      sandbox,
      ["bash", "-c", `exec 3<>/dev/tcp/127.0.0.1/${port} && echo open`],
      { timeoutMs: 5_000 }
    ).catch(() => null);
    if (r && r.exitCode === 0 && r.stdout.includes("open")) return true;
    await new Promise((res) => setTimeout(res, 1000));
  }
  return false;
}

function truncate(s: string): string {
  if (s.length > MAX_OUTPUT_CHARS) {
    return s.slice(0, MAX_OUTPUT_CHARS) + `\n...[truncated to ${MAX_OUTPUT_CHARS} chars]...`;
  }
  return s;
}
