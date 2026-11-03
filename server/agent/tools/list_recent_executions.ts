import { z } from "zod";
import type { AgentTool } from "./types";
import { db } from "../../workspace/db";

export interface ListRecentExecutionsArgs {
  workspaceId?: string;
  pluginId?: string;
  status?: "all" | "success" | "failed" | "denied";
  limit?: number;
}

export const list_recent_executions: AgentTool<ListRecentExecutionsArgs> = {
  name: "list_recent_executions",
  description:
    "Lists recent capability runs by status. Use to spot failure patterns; not for routine checks.",
  schema: z.object({
    workspaceId: z.string().optional().describe("Filter by workspace"),
    pluginId: z.string().optional().describe("Filter by plugin identifier"),
    status: z
      .enum(["all", "success", "failed", "denied"])
      .optional()
      .default("all")
      .describe("Filter by execution status"),
    limit: z.number().int().min(1).max(50).optional().default(10),
  }),
  execute: async (args, ctx) => {
    // The listing scope comes from the session, never from a model arg:
    // a turn lists only its own workspace's runs. An explicit cross-scope
    // filter is denied; otherwise the filter is pinned to the session.
    const sessionScope = ctx?.workspaceId;
    if (args.workspaceId && sessionScope && args.workspaceId !== sessionScope) {
      return { success: false, error: "Not found" };
    }
    const targetWorkspace = sessionScope || args.workspaceId;
    const limit = args.limit || 10;

    let query = "SELECT execution_id, capability_id, plugin_id, actor, workspace_id, status, duration_ms, error, created_at FROM executions WHERE 1=1";
    const params: any[] = [];

    if (targetWorkspace) {
      query += " AND (workspace_id = ? OR workspace_id IS NULL)";
      params.push(targetWorkspace);
    }

    if (args.pluginId) {
      query += " AND plugin_id = ?";
      params.push(args.pluginId);
    }

    if (args.status && args.status !== "all") {
      query += " AND status = ?";
      params.push(args.status);
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = db.query<
      {
        execution_id: string;
        capability_id: string;
        plugin_id: string;
        actor: string;
        workspace_id: string | null;
        status: string;
        duration_ms: number;
        error: string | null;
        created_at: string;
      },
      any[]
    >(query).all(...params);

    return {
      success: true,
      executions: rows.map((r) => ({
        executionId: r.execution_id,
        capabilityId: r.capability_id,
        pluginId: r.plugin_id,
        actor: r.actor,
        workspaceId: r.workspace_id,
        status: r.status,
        durationMs: r.duration_ms,
        error: r.error,
        createdAt: r.created_at,
      })),
      count: rows.length,
    };
  },
};
