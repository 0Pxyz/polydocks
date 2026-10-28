import { z } from "zod";
import type { AgentTool } from "./types";
import { writeFileSafe } from "../../system/filesystem";

export const write_file: AgentTool<{ path: string; content: string; overwrite?: boolean }> = {
  name: "write_file",
  description:
    "Writes or creates a file atomically in agent-home, creating parent directories automatically.",
  schema: z.object({
    path: z.string().describe("File path relative to agent-home (e.g. 'artifacts/report.md', 'tasks/summary.json')"),
    content: z.string().describe("Full text content to write"),
    overwrite: z.boolean().optional().describe("Whether to overwrite if file already exists (default true)"),
  }),
  execute: async (args) => {
    return await writeFileSafe(args.path, args.content, {
      overwrite: args.overwrite ?? true,
    });
  },
};
