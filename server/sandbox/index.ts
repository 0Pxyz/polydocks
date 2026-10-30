import { redactSecrets } from "../plugins/redact";
import {
  getSandboxRecord,
  upsertSandboxRecord,
  updateSandboxStatus,
  clearSandboxRecord,
  sandboxNameFor,
  volumeNameFor,
} from "./store";
import {
  isModalConfigured,
  modalNotConfiguredError,
  ensureSandbox,
  execInSandbox,
  sandboxStatus,
  terminateSandbox,
  previewUrlFor,
  waitForPort,
} from "./modalProvider";

export interface SandboxReceipt {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  retryable?: boolean;
  code?: string;
}

const WORKDIR = "/repo";
const SERVE_PORTS = [3000, 5173, 8080];

function fail(error: string, code = "sandbox_unavailable", retryable = false): SandboxReceipt {
  return { ok: false, error, retryable, code };
}

function toArgs(command: string): string[] {
  return ["bash", "-c", command];
}

/** Sandbox workdir-relative path guard: no absolutes, no escapes. */
export function sandboxPath(rel: string): string | null {
  if (!rel || typeof rel !== "string") return null;
  if (rel.startsWith("/")) return null;
  const parts = rel.split("/");
  let depth = 0;
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") {
      depth--;
      if (depth < 0) return null;
    } else {
      depth++;
    }
  }
  const clean = parts.filter((p) => p !== "" && p !== ".").join("/");
  if (!clean || clean.startsWith("..")) return null;
  return `${WORKDIR}/${clean}`;
}

async function withSandbox<T>(
  workspaceId: string,
  fn: (sandbox: any) => Promise<T>
): Promise<{ result: T; sandboxId: string; reused: boolean } | SandboxReceipt> {
  if (!isModalConfigured()) return fail(modalNotConfiguredError(), "modal_not_configured", false);
  const name = sandboxNameFor(workspaceId);
  const volume = volumeNameFor(workspaceId);
  const stored = getSandboxRecord(workspaceId);
  let handle: { sandbox: any; reused: boolean };
  try {
    handle = await ensureSandbox(workspaceId, name, volume, { knownSandboxId: stored?.sandboxId });
  } catch (err: any) {
    return fail(`Sandbox ensure failed: ${redactSecrets(err?.message || String(err))}`, "sandbox_ensure_failed", true);
  }
  try {
    const result = await fn(handle.sandbox);
    const sid = String(handle.sandbox.sandboxId || stored?.sandboxId || "");
    if (sid && (!stored || stored.sandboxId !== sid)) {
      upsertSandboxRecord({ workspaceId, sandboxId: sid, name, volume, status: "running" });
    } else if (stored && handle.reused) {
      updateSandboxStatus(workspaceId, "running");
    }
    return { result, sandboxId: sid, reused: handle.reused };
  } catch (err: any) {
    return fail(`Sandbox op failed: ${redactSecrets(err?.message || String(err))}`, "sandbox_op_failed", true);
  }
}

export async function sandboxExec(
  workspaceId: string,
  command: string,
  opts: { timeoutMs?: number } = {}
): Promise<SandboxReceipt> {
  if (!command || !command.trim()) return fail("exec needs a non-empty command.", "invalid_input", false);
  const out = await withSandbox(workspaceId, (sb) => execInSandbox(sb, toArgs(command), { timeoutMs: opts.timeoutMs }));
  if (!isOk(out)) return out;
  const r = out.result;
  const ok = r.exitCode === 0;
  return {
    ok,
    data: {
      sandboxId: out.sandboxId,
      reused: out.reused,
      exitCode: r.exitCode,
      stdout: r.stdout,
      stderr: r.stderr,
      durationMs: r.durationMs,
      ...(ok ? {} : { error: `Command exited with code ${r.exitCode}.`, retryable: true }),
    },
    ...(ok ? {} : { error: `Command exited with code ${r.exitCode}.`, retryable: true, code: "nonzero_exit" }),
  };
}

export async function sandboxWriteFile(workspaceId: string, relPath: string, content: string): Promise<SandboxReceipt> {
  const full = sandboxPath(relPath);
  if (!full) return fail(`Refusing unsafe sandbox path "${relPath}".`, "invalid_input", false);
  if (content.length > 512_000) return fail("File content exceeds the 512KB sandbox write cap.", "invalid_input", false);
  const out = await withSandbox(workspaceId, async (sb) => {
    await sb.filesystem.writeText(content, full);
    return { path: relPath };
  });
  if (!isOk(out)) return out;
  return { ok: true, data: { sandboxId: out.sandboxId, reused: out.reused, path: relPath } };
}

export async function sandboxReadFile(workspaceId: string, relPath: string): Promise<SandboxReceipt> {
  const full = sandboxPath(relPath);
  if (!full) return fail(`Refusing unsafe sandbox path "${relPath}".`, "invalid_input", false);
  const out = await withSandbox(workspaceId, async (sb) => {
    const content: string = await sb.filesystem.readText(full);
    return { content };
  });
  if (!isOk(out)) return out;
  const content = String(out.result.content || "");
  return {
    ok: true,
    data: { sandboxId: out.sandboxId, reused: out.reused, path: relPath, content: capText(content, 32_000) },
  };
}

export async function sandboxListFiles(workspaceId: string, relDir = "."): Promise<SandboxReceipt> {
  const full = sandboxPath(relDir === "." ? "repo-root" : relDir);
  const dir = relDir === "." ? WORKDIR : full;
  if (relDir !== "." && !dir) return fail(`Refusing unsafe sandbox path "${relDir}".`, "invalid_input", false);
  const out = await withSandbox(workspaceId, async (sb) => {
    const entries = await sb.filesystem.listFiles(dir as string);
    return { entries: (entries || []).map((e: any) => ({ name: e.name, type: String(e.type || "unknown") })) };
  });
  if (!isOk(out)) return out;
  return { ok: true, data: { sandboxId: out.sandboxId, reused: out.reused, dir: relDir, entries: out.result.entries } };
}

export async function sandboxServe(
  workspaceId: string,
  command: string,
  opts: { port?: number; timeoutMs?: number } = {}
): Promise<SandboxReceipt> {
  if (!command || !command.trim()) return fail("serve needs a non-empty start command.", "invalid_input", false);
  const port = opts.port && SERVE_PORTS.includes(opts.port) ? opts.port : 3000;
  const out = await withSandbox(workspaceId, async (sb) => {
    // Stop any previous server on the port, then start detached with logs.
    await execInSandbox(sb, ["bash", "-c", `pkill -f "port-${port}" 2>/dev/null; fuser -k ${port}/tcp 2>/dev/null; true`], { timeoutMs: 10_000 }).catch(() => null);
    await execInSandbox(
      sb,
      ["bash", "-c", `cd ${WORKDIR} && nohup bash -c ${shQuote(command)} > /tmp/serve-${port}.log 2>&1 & echo $!`],
      { timeoutMs: 15_000 }
    );
    const ready = await waitForPort(sb, port, opts.timeoutMs ?? 30_000);
    const url = ready ? await previewUrlFor(sb, port) : null;
    const logs = await execInSandbox(sb, ["bash", "-c", `tail -c 4000 /tmp/serve-${port}.log 2>/dev/null || echo "(no logs yet)"`], { timeoutMs: 10_000 }).catch(() => null);
    return { port, ready, url, logPreview: logs ? String((logs as any).stdout || "") : "" };
  });
  if (!isOk(out)) return out;
  const { port: p, ready, url, logPreview } = out.result as any;
  if (!ready || !url) {
    try {
      const rec = getSandboxRecord(workspaceId);
      if (rec) updateSandboxStatus(workspaceId, rec.status, null);
    } catch {
      // Non-fatal.
    }
    return {
      ok: false,
      error: `Server did not become ready on port ${p} within the wait window. Log preview: ${(logPreview || "").slice(0, 1000)}`,
      retryable: true,
      code: "serve_not_ready",
      data: { sandboxId: out.sandboxId, port: p, logPreview },
    } as SandboxReceipt;
  }
  updateSandboxStatus(workspaceId, "running", url);
  return { ok: true, data: { sandboxId: out.sandboxId, reused: out.reused, port: p, previewUrl: url, logPreview } };
}

export async function sandboxLogs(workspaceId: string, opts: { port?: number } = {}): Promise<SandboxReceipt> {
  const port = opts.port && SERVE_PORTS.includes(opts.port) ? opts.port : 3000;
  const out = await withSandbox(workspaceId, async (sb) => {
    const r = await execInSandbox(sb, ["bash", "-c", `tail -c 8000 /tmp/serve-${port}.log 2>/dev/null || echo "(no server log on port ${port})"`], { timeoutMs: 10_000 });
    const st = await sandboxStatus(sb);
    return { log: r.stdout, state: st.state, exitCode: st.exitCode };
  });
  if (!isOk(out)) return out;
  return { ok: true, data: { sandboxId: out.sandboxId, port, ...(out.result as object) } };
}

export async function sandboxStatusInfo(workspaceId: string): Promise<SandboxReceipt> {
  if (!isModalConfigured()) return fail(modalNotConfiguredError(), "modal_not_configured", false);
  const stored = getSandboxRecord(workspaceId);
  if (!stored) {
    return { ok: true, data: { workspaceId, state: "none", sandboxId: null, previewUrl: null } };
  }
  const out = await withSandbox(workspaceId, async (sb) => {
    const st = await sandboxStatus(sb);
    const url = stored.previewUrl || (await previewUrlFor(sb, 3000).catch(() => null));
    return { ...st, url };
  });
  if (!isOk(out)) {
    updateSandboxStatus(workspaceId, "finished");
    return { ok: true, data: { workspaceId, state: "finished", sandboxId: stored.sandboxId, previewUrl: null, note: "Stored sandbox is gone; next exec recreates it on the same volume." } };
  }
  updateSandboxStatus(workspaceId, (out.result as any).state, ((out.result as any).url as string) || null);
  return { ok: true, data: { workspaceId, sandboxId: stored.sandboxId, ...(out.result as object) } };
}

export async function sandboxTerminate(workspaceId: string): Promise<SandboxReceipt> {
  if (!isModalConfigured()) return fail(modalNotConfiguredError(), "modal_not_configured", false);
  const stored = getSandboxRecord(workspaceId);
  if (!stored) return { ok: true, data: { workspaceId, terminated: false, note: "No sandbox recorded." } };
  try {
    const { ModalClient } = await import("modal");
    const modal = new ModalClient() as any;
    const sb = await modal.sandboxes.fromId(stored.sandboxId).catch(() => null);
    if (sb) await terminateSandbox(sb);
  } catch {
    // Already gone — still clear the pointer.
  }
  clearSandboxRecord(workspaceId);
  return { ok: true, data: { workspaceId, terminated: true, note: "Volume kept: files survive replacement." } };
}

function isOk<T>(v: { result: T; sandboxId: string; reused: boolean } | SandboxReceipt): v is { result: T; sandboxId: string; reused: boolean } {
  return (v as any).result !== undefined;
}

function capText(s: string, cap: number): string {
  return s.length > cap ? s.slice(0, cap) + `\n...[truncated to ${cap} chars]...` : s;
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
