import { z } from "zod";
import type { AgentTool } from "./types";
import { capabilityBus } from "../../plugins/bus";

const scope = {
  workspaceId: z.string().optional().describe("Workspace whose sandbox to use"),
  userApproved: z.boolean().optional().describe("Set true only after the user explicitly said yes (sandbox execution is ask-by-default)"),
};

function targetCtx(ctx: any, args: { workspaceId?: string }) {
  const sessionScope = ctx?.workspaceId;
  // The scope comes from the authenticated session (the turn), never from
  // a model-contrived argument: a tool call may not widen beyond the
  // session scope. Local turns without a session scope keep today's
  // open behavior (args or bust).
  if (args.workspaceId && sessionScope && args.workspaceId !== sessionScope) {
    return { denied: `Not found` } as const;
  }
  const workspaceId = sessionScope || args.workspaceId;
  return { workspaceId };
}

async function runSandboxTool(capability: string, args: Record<string, unknown>, ctx: any) {
  const { initializeFirstPartyPlugins } = await import("../../plugins/first-party/index");
  initializeFirstPartyPlugins();
  const { workspaceId, userApproved, ...rest } = args as any;
  const t = targetCtx(ctx, { workspaceId });
  if ("denied" in t) {
    return { error: t.denied, capabilityId: capability };
  }
  const result = await capabilityBus.invoke(capability, { ...rest, workspaceId: t.workspaceId, userApproved }, {
    actor: "agent",
    workspaceId: t.workspaceId,
    step: ctx?.step,
    taskId: ctx?.taskId,
    onEvent: ctx?.onEvent,
  });
  if (!result.success) {
    return { error: result.error || `Execution failed for capability "${capability}"`, capabilityId: capability, durationMs: result.durationMs };
  }
  return { success: true, capabilityId: capability, ...(result.data as object || {}), durationMs: result.durationMs };
}

export const sandbox_exec: AgentTool<{ command: string; timeoutMs?: number; workspaceId?: string; userApproved?: boolean }> = {
  name: "sandbox_exec",
  description:
    "Runs a shell command in the workspace's isolated Modal sandbox. Use to execute code, install dependencies, run scripts or inspect output. Mutating execution needs { userApproved: true } (ask-by-default); without it the call fails closed.",
  schema: z.object({
    command: z.string().min(1).describe("Shell command to run (bash -c)"),
    timeoutMs: z.number().int().min(1000).max(600_000).optional().describe("Command timeout in ms (default 120000)"),
    ...scope,
  }),
  execute: (args, ctx) => runSandboxTool("sandbox.exec", args as Record<string, unknown>, ctx),
};

export const sandbox_write_file: AgentTool<{ path: string; content: string; workspaceId?: string; userApproved?: boolean }> = {
  name: "sandbox_write_file",
  description:
    "Writes a file inside the workspace sandbox (workdir-relative path). Use to create or edit sandbox files before running them. Needs { userApproved: true } (ask-by-default).",
  schema: z.object({
    path: z.string().min(1).describe("Workdir-relative destination path"),
    content: z.string().describe("File content (512KB cap)"),
    ...scope,
  }),
  execute: (args, ctx) => runSandboxTool("sandbox.write_file", args as Record<string, unknown>, ctx),
};

export const sandbox_read_file: AgentTool<{ path: string; workspaceId?: string }> = {
  name: "sandbox_read_file",
  description:
    "Reads a file from the workspace sandbox (workdir-relative path). Read-only; use to inspect code, output or errors.",
  schema: z.object({
    path: z.string().min(1).describe("Workdir-relative file path"),
    workspaceId: scope.workspaceId,
  }),
  execute: (args, ctx) => runSandboxTool("sandbox.read_file", args as Record<string, unknown>, ctx),
};

export const sandbox_list_files: AgentTool<{ dir?: string; workspaceId?: string }> = {
  name: "sandbox_list_files",
  description:
    "Lists files in a workspace sandbox directory (read-only). Use to inspect what the sandbox holds before running or serving.",
  schema: z.object({
    dir: z.string().optional().describe("Workdir-relative directory (default .)"),
    workspaceId: scope.workspaceId,
  }),
  execute: (args, ctx) => runSandboxTool("sandbox.list_files", args as Record<string, unknown>, ctx),
};

export const sandbox_serve: AgentTool<{ command: string; port?: number; timeoutMs?: number; workspaceId?: string; userApproved?: boolean }> = {
  name: "sandbox_serve",
  description:
    "Starts a dev server in the workspace sandbox and returns a public previewUrl. Use to serve apps for the user to open. Needs { userApproved: true } (ask-by-default). Report exactly the returned previewUrl.",
  schema: z.object({
    command: z.string().min(1).describe("Start command (e.g. 'npm start', 'node server.js', 'python3 -m http.server 3000')"),
    port: z.number().int().optional().describe("Port to expose: 3000, 5173 or 8080 (default 3000)"),
    timeoutMs: z.number().int().min(1000).max(120_000).optional().describe("Readiness wait in ms (default 30000)"),
    ...scope,
  }),
  execute: (args, ctx) => runSandboxTool("sandbox.serve", args as Record<string, unknown>, ctx),
};

export const sandbox_logs: AgentTool<{ port?: number; workspaceId?: string }> = {
  name: "sandbox_logs",
  description:
    "Tails the sandbox dev-server log and reports sandbox state (read-only). Use to inspect startup output and errors after sandbox_serve.",
  schema: z.object({
    port: z.number().int().optional().describe("Port whose log to tail (default 3000)"),
    workspaceId: scope.workspaceId,
  }),
  execute: (args, ctx) => runSandboxTool("sandbox.logs", args as Record<string, unknown>, ctx),
};

export const sandbox_status: AgentTool<{ workspaceId?: string }> = {
  name: "sandbox_status",
  description:
    "Reports the workspace sandbox lifecycle state and preview URL (read-only). Use to check whether a sandbox is running before executing.",
  schema: z.object({
    workspaceId: scope.workspaceId,
  }),
  execute: (args, ctx) => runSandboxTool("sandbox.status", args as Record<string, unknown>, ctx),
};

export const sandbox_terminate: AgentTool<{ workspaceId?: string; userApproved?: boolean }> = {
  name: "sandbox_terminate",
  description:
    "Terminates the workspace sandbox (volume kept: files survive replacement). Use only for explicit cleanup asks. Needs { userApproved: true } (ask-by-default).",
  schema: z.object({
    ...scope,
  }),
  execute: (args, ctx) => runSandboxTool("sandbox.terminate", args as Record<string, unknown>, ctx),
};
