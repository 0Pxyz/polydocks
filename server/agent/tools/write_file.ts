import { z } from "zod";
import type { AgentTool } from "./types";
import { writeFileSafe } from "../../system/filesystem";

export const write_file: AgentTool<{ path: string; content: string; overwrite?: boolean }> = {
  name: "write_file",
  description:
    "Writes one agent-home file. Use for agent artifacts; never for city notes (use write_city_file).",
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
