import { z } from "zod";
import type { AgentTool } from "../../types";
import { readSkillContent, READABLE_SKILLS } from "../read_skill";

export const skillsRead: AgentTool<{ name?: string }> = {
  name: "skills.read",
  description:
    "Loads one long-form skill on demand (app map, dock/plugin contracts, research protocol, sandbox, memory, verify). Omit name to list available skills. Same handler as read_skill.",
  schema: z.object({
    name: z
      .string()
      .optional()
      .describe(`Skill to load (${READABLE_SKILLS.join(", ")}). Omit to list.`),
  }),
  execute: (args, _ctx) => readSkillContent(args.name),
};
