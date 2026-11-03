import { z } from "zod";
import type { AgentTool } from "./types";

/**
 * Explicit escalation hatch: the fast agent calls this when a turn really
 * needs heavy background work (multi-step synthesis, long crawls).
 * The orchestrator router never sends work here on its own; routing stays
 * on the fast agent with the full toolset unless the agent decides otherwise.
 */
export const start_background_job: AgentTool<{
  prompt: string;
  type?: string;
  timeoutMs?: number;
}> = {
  name: "start_background_job",
  description:
    "Starts a heavy job in the background and returns at once with a taskId. Use ONLY when the work genuinely needs minutes of autonomous execution (large code synthesis, long crawls). Prefer answering inline with the tools you already have. The user is notified when the job lands; never use this to avoid answering.",
  schema: z.object({
    prompt: z.string().min(1).describe("Self-contained instructions for the background run"),
    type: z
      .enum(["plugin_synthesis", "research", "background_worker"])
      .optional()
      .describe("Job type (default plugin_synthesis)"),
    timeoutMs: z.number().int().min(10_000).max(12 * 60 * 60 * 1000).optional().describe("Job timeout in ms"),
  }),
  execute: async (args, ctx) => {
    const { TaskService } = await import("../../services/taskService");
    const created = await TaskService.createTask({
      sessionId: ctx.sessionId || "default",
      workspaceId: ctx.workspaceId || "default",
      type: args.type || "plugin_synthesis",
      input: { prompt: args.prompt, timeoutMs: args.timeoutMs, escalated: true },
    });
    await TaskService.runTask(created);
    return {
      success: true,
      taskId: created.id,
      status: "queued",
      message: `Background job ${created.id} started. The user will be notified when it lands; keep your reply short.`,
    };
  },
};
