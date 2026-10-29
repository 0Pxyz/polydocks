import { z } from "zod";
import type { AgentTool } from "./types";
import { searchFiles } from "../../system/filesystem";

export const search_files: AgentTool<{ query: string; path?: string; extension?: string }> = {
  name: "search_files",
  description:
    "Searches agent-home text. Use to locate agent files; never for city content.",
  schema: z.object({
    query: z.string().describe("Keyword or regex query string"),
    path: z.string().optional().describe("Directory path relative to agent-home to limit search (default '.')"),
    extension: z.string().optional().describe("Optional file extension filter (e.g. '.md', '.json')"),
  }),
  execute: async (args) => {
    return await searchFiles(args.query, {
      path: args.path,
      extension: args.extension,
    });
  },
};
