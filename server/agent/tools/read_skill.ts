import { z } from "zod";
import type { AgentTool } from "./types";
import { loadSkill, stripSkillMetadata, skillTokens } from "../skills/index";

/**
 * On-demand skill loading (#209): long material lives in skill files, not
 * in the base prompt. The model lists what's available and pulls a skill
 * only when the turn needs it. The deterministic intent selector still
 * injects at most two domain skills up front; everything else (including
 * the app map) loads through this tool.
 */
export const READABLE_SKILLS = [
  "app-overview",
  "dock",
  "theme",
  "plugins",
  "capabilities-and-mcp",
  "content-and-reader",
  "sandbox",
  "memory-and-files",
  "verify-and-report",
] as const;

const ReadSkillSchema = z.object({
  name: z
    .string()
    .optional()
    .describe(
      `Skill to load (${READABLE_SKILLS.join(", ")}). Omit to list available skills with sizes.`
    ),
});

type ReadSkillInput = z.infer<typeof ReadSkillSchema>;

export async function readSkillContent(name?: string): Promise<unknown> {
  if (!name) {
    const sizes: Array<{ name: string; tokens: number }> = [];
    for (const skill of READABLE_SKILLS) {
      try {
        sizes.push({ name: skill, tokens: skillTokens(await loadSkill(skill)) });
      } catch {
        // Skip unreadable skills in the listing.
      }
    }
    return { skills: sizes };
  }
  const normalized = name.trim().toLowerCase().replace(/\.md$/, "");
  if (!(READABLE_SKILLS as readonly string[]).includes(normalized)) {
    return {
      error: `Unknown skill "${name}". Available: ${READABLE_SKILLS.join(", ")}.`,
    };
  }
  const content = stripSkillMetadata(await loadSkill(normalized));
  return { name: normalized, tokens: skillTokens(content), content };
}

export const read_skill: AgentTool<ReadSkillInput> = {
  name: "read_skill",
  description:
    "Loads one long-form skill on demand (app map, dock/plugin contracts, research protocol, sandbox, memory, verify). Base prompt stays short — pull a skill only when the turn needs it. Omit name to list available skills.",
  schema: ReadSkillSchema,
  execute: async (input) => readSkillContent(input.name),
};
