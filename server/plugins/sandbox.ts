import { z } from "zod";
import { pluginRegistry } from "./registry";
import { capabilityBus } from "./bus";
import { redactSecrets } from "./redact";
import type { PluginManifest } from "./manifest";
import {
  sandboxExec,
  sandboxWriteFile,
  sandboxReadFile,
  sandboxListFiles,
  sandboxServe,
  sandboxLogs,
  sandboxStatusInfo,
  sandboxTerminate,
} from "../sandbox/index";

/**
 * Sandbox first-party plugin (agent code execution on Modal).
 *
 * One workspace ↔ one sandbox (named, tagged), one volume per workspace for
 * file survival across replacements. Product data stays in PolyDocks
 * workspace tables; the sandbox filesystem is disposable compute.
 *
 * Policy: mutating capabilities (exec/write/serve/terminate) pass the shared
 * install-policy gate for actor=agent (ask → needs userApproved, auto →
 * proceed, never → deny), the same rule as plugin lifecycle writes. Reads
 * (read/list/status/logs) are free. No secrets are ever accepted or
 * injected: exec env comes only from explicit non-secret args, and all
 * inputs/outputs are redacted in the audit trail.
 */
export const sandboxPluginManifest: PluginManifest = {
  apiVersion: 1,
  id: "sandbox",
  name: "Isolated Code Execution",
  version: "1.0.0",
  description: "Runs shell commands, manages files and serves apps in an isolated Modal sandbox per workspace.",
  icon: "Terminal",
  trust: "first-party",
  capabilities: [
    {
      id: "sandbox.exec",
      title: "Execute Shell Command",
      description: "Runs a shell command in the workspace sandbox and returns exit code, stdout and stderr.",
      input: z.object({
        command: z.string().min(1).describe("Shell command to run (bash -c)"),
        timeoutMs: z.number().int().min(1000).max(600_000).optional().describe("Command timeout (default 120s)"),
      }),
      risk: "write",
    },
    {
      id: "sandbox.write_file",
      title: "Write Sandbox File",
      description: "Writes text to a workdir-relative path inside the workspace sandbox.",
      input: z.object({
        path: z.string().min(1).describe("Workdir-relative destination path"),
        content: z.string().describe("File content (512KB cap)"),
      }),
      risk: "write",
    },
    {
      id: "sandbox.read_file",
      title: "Read Sandbox File",
      description: "Reads a workdir-relative file from the workspace sandbox.",
      input: z.object({
        path: z.string().min(1).describe("Workdir-relative file path"),
      }),
      risk: "read",
    },
    {
      id: "sandbox.list_files",
      title: "List Sandbox Files",
      description: "Lists entries in a workdir-relative sandbox directory.",
      input: z.object({
        dir: z.string().optional().describe("Workdir-relative directory (default .)"),
      }),
      risk: "read",
    },
    {
      id: "sandbox.serve",
      title: "Serve App with Preview",
      description: "Starts a dev server in the sandbox and returns a public preview URL.",
      input: z.object({
        command: z.string().min(1).describe("Start command (e.g. 'npm start', 'python3 -m http.server 3000')"),
        port: z.number().int().optional().describe("Port to expose (3000, 5173 or 8080; default 3000)"),
        timeoutMs: z.number().int().min(1000).max(120_000).optional().describe("Readiness wait (default 30s)"),
      }),
      risk: "write",
    },
    {
      id: "sandbox.logs",
      title: "Inspect Server Logs",
      description: "Tails the sandbox dev-server log and reports sandbox state.",
      input: z.object({
        port: z.number().int().optional().describe("Port whose log to tail (default 3000)"),
      }),
      risk: "read",
    },
    {
      id: "sandbox.status",
      title: "Sandbox Status",
      description: "Reports the workspace sandbox lifecycle state and preview URL.",
      input: z.object({}),
      risk: "read",
    },
    {
      id: "sandbox.terminate",
      title: "Terminate Sandbox",
      description: "Terminates the workspace sandbox (volume kept: files survive replacement).",
      input: z.object({}),
      risk: "write",
    },
  ],
  permissions: [{ type: "net", hosts: ["api.modal.com"] }],
  skill: {
    file: "server/agent/skills/sandbox.md",
    triggers: ["sandbox", "execute", "run code", "rodar", "executar", "terminal", "preview", "servidor", "server", "logs"],
  },
};

const MUTATING = new Set(["sandbox.exec", "sandbox.write_file", "sandbox.serve", "sandbox.terminate"]);

export function registerSandboxPlugin(): void {
  pluginRegistry.install(sandboxPluginManifest);

  const gated = (capabilityId: string, handler: (input: any, ctx: any) => Promise<unknown>) => {
    capabilityBus.register(
      "sandbox",
      sandboxPluginManifest.capabilities.find((c) => c.id === capabilityId)!,
      async (input, ctx) => {
        if (MUTATING.has(capabilityId)) {
          const { enforceInstallPolicy } = await import("../agent/installPolicy");
          const denied = enforceInstallPolicy(ctx?.actor, (input as any)?.userApproved);
          if (denied) {
            return {
              ok: false as const,
              error: denied.error,
              retryable: false as const,
              code: denied.code,
            };
          }
        }
        const { userApproved: _dropped, ...rest } = (input || {}) as Record<string, unknown>;
        void _dropped;
        const cityId = (rest as any).cityId || ctx.cityId || "default";
        const workspaceId = (rest as any).workspaceId || cityId;
        return await handler({ ...rest, workspaceId }, ctx);
      }
    );
  };

  gated("sandbox.exec", async (input) => finish(await sandboxExec(input.workspaceId, input.command, { timeoutMs: input.timeoutMs })));
  gated("sandbox.write_file", async (input) => finish(await sandboxWriteFile(input.workspaceId, input.path, input.content)));
  gated("sandbox.read_file", async (input) => finish(await sandboxReadFile(input.workspaceId, input.path)));
  gated("sandbox.list_files", async (input) => finish(await sandboxListFiles(input.workspaceId, input.dir)));
  gated("sandbox.serve", async (input) => finish(await sandboxServe(input.workspaceId, input.command, { port: input.port, timeoutMs: input.timeoutMs })));
  gated("sandbox.logs", async (input) => finish(await sandboxLogs(input.workspaceId, { port: input.port })));
  gated("sandbox.status", async (input) => finish(await sandboxStatusInfo(input.workspaceId)));
  gated("sandbox.terminate", async (input) => finish(await sandboxTerminate(input.workspaceId)));
}

function finish(receipt: { ok: boolean; data?: unknown; error?: string; retryable?: boolean; code?: string }): unknown {
  if (!receipt.ok) {
    return {
      ok: false as const,
      error: redactSecrets(receipt.error || "Sandbox operation failed."),
      retryable: receipt.retryable === true,
      ...(receipt.code ? { code: receipt.code } : {}),
    };
  }
  return { ok: true as const, data: redactSecrets(receipt.data) };
}
