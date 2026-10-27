import fs from "node:fs/promises";
import path from "node:path";

const skillCache = new Map<string, string>();

/**
 * Loads a specialized skill instruction markdown file from server/agent/skills/.
 */
export async function loadSkill(skillName: string): Promise<string> {
  const normalized = skillName.trim().toLowerCase().replace(/\.md$/, "");
  if (skillCache.has(normalized)) {
    return skillCache.get(normalized)!;
  }

  const filePath = path.join(import.meta.dir, `${normalized}.md`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    skillCache.set(normalized, content);
    return content;
  } catch (err: any) {
    throw new Error(`Skill "${skillName}" not found at ${filePath}: ${err.message}`);
  }
}

/**
 * Heuristic detector for whether user prompt involves dynamic tab/tool creation.
 */
export function isTabSynthesisIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const triggers = [
    "create tab",
    "create a tab",
    "cria uma tab",
    "crie uma tab",
    "build tool",
    "build a tool",
    "make a tool",
    "synthesize tool",
    "synthesize a tab",
    "flashcard",
    "comparator",
    "matrix",
    "quiz tab",
    "calculator tab",
    "tool for",
    "tab for",
  ];

  return triggers.some((t) => lower.includes(t));
}
