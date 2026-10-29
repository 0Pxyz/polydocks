import { z } from "zod";
import type { AgentTool } from "./types";
import { readFileSafe } from "../../system/filesystem";

export const read_file: AgentTool<{ path: string; offset?: number; limit?: number }> = {
  name: "read_file",
  description:
    "Reads one agent-home file with pagination. Use for agent files; never for city files (use read_city_file).",
  schema: z.object({
    path: z.string().describe("File path relative to agent-home (e.g. 'AGENTS.md', 'memory/2026-10-28.md')"),
    offset: z.number().int().nonnegative().optional().describe("Starting line offset (0-indexed)"),
    limit: z.number().int().positive().optional().describe("Number of lines to read"),
  }),
  execute: async (args) => {
    return await readFileSafe(args.path, {
      offset: args.offset,
      limit: args.limit,
    });
  },
};
