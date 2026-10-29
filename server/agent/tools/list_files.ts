import { z } from "zod";
import type { AgentTool } from "./types";
import { listFiles } from "../../system/filesystem";

export const list_files: AgentTool<{ path?: string; recursive?: boolean; maxDepth?: number }> = {
  name: "list_files",
  description:
    "Lists agent-home files. Use for the agent's own disk; never for city contents (use get_city_context or read_city_file).",
  schema: z.object({
    path: z.string().optional().describe("Directory path relative to agent-home (defaults to root '.')"),
    recursive: z.boolean().optional().describe("Whether to recursively scan nested directories"),
    maxDepth: z.number().int().positive().optional().describe("Maximum recursion depth (default 3)"),
  }),
  execute: async (args) => {
    const entries = await listFiles(args.path || ".", {
      recursive: args.recursive,
      maxDepth: args.maxDepth,
    });
    return {
      path: args.path || ".",
      entries,
      totalEntries: entries.length,
    };
  },
};
