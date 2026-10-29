import { z } from "zod";
import type { AgentTool } from "./types";
import { editFileSafe } from "../../system/filesystem";

export const edit_file: AgentTool<{ path: string; target: string; replacement: string }> = {
  name: "edit_file",
  description:
    "Replaces one unique substring in an agent-home file. Use for surgical edits; do not use when the target is ambiguous or for city files.",
  schema: z.object({
    path: z.string().describe("File path relative to agent-home"),
    target: z.string().describe("Exact substring to replace (must match uniquely in the file)"),
    replacement: z.string().describe("Replacement substring"),
  }),
  execute: async (args) => {
    return await editFileSafe(args.path, args.target, args.replacement);
  },
};
