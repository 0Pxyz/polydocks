import { z } from "zod";
import type { AgentTool } from "./types";
import { db } from "../../workspace/db";

export interface InspectExecutionArgs {
  executionId: string;
}

export const inspect_execution: AgentTool<InspectExecutionArgs> = {
  name: "inspect_execution",
  description:
    "Shows one capability run's arguments, output, error, and duration. Use to diagnose a failure; not for routine checks.",
  schema: z.object({
    executionId: z.string().min(1).describe("The execution ID (e.g. exec_...) to inspect"),
  }),
  execute: async (args) => {
    const row = db
      .query<
        {
          execution_id: string;
          capability_id: string;
          plugin_id: string;
          actor: string;
          workspace_id: string | null;
          status: string;
          duration_ms: number;
          input_json: string | null;
          output_json: string | null;
          error: string | null;
          created_at: string;
        },
        [string]
      >("SELECT * FROM executions WHERE execution_id = ?")
      .get(args.executionId);

    if (!row) {
      return {
        success: false,
        error: `Execution record "${args.executionId}" not found in audit log.`,
      };
    }

    let input: unknown = null;
    let output: unknown = null;

    if (row.input_json) {
      try {
        input = JSON.parse(row.input_json);
      } catch {
        input = row.input_json;
      }
    }

    if (row.output_json) {
      try {
        output = JSON.parse(row.output_json);
      } catch {
        output = row.output_json;
      }
    }

    return {
      success: true,
      execution: {
        executionId: row.execution_id,
        capabilityId: row.capability_id,
        pluginId: row.plugin_id,
        actor: row.actor,
        workspaceId: row.workspace_id,
        status: row.status,
        durationMs: row.duration_ms,
        input,
        output,
        error: row.error,
        createdAt: row.created_at,
      },
    };
  },
};
