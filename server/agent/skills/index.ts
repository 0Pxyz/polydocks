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
    "crie uma nova experiência",
    "crie uma experiência",
    "criar experiência",
    "nova experiência",
    "experiência na dock",
    "experiencia na dock",
    "mapa do tema",
    "mapa mental",
    "mapa de conceitos",
    "concept map",
    "knowledge map",
    "knowledge graph",
    "interactive map",
    "flashcard",
    "comparator",
    "matrix",
    "quiz tab",
    "calculator tab",
    "tool for",
    "tab for",
    "experience for",
  ];

  return triggers.some((t) => lower.includes(t));
}

/**
 * Heuristic detector for whether user prompt involves web research, discovery, or content curation.
 */
export function isResearchIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const triggers = [
    "research",
    "search",
    "find paper",
    "papers",
    "feed",
    "curate",
    "pesquisa",
    "pesquise",
    "buscar",
    "encontrar",
    "noticias",
    "fontes",
    "sources",
    "latest on",
    "learn about",
    "explore",
    "tutorial",
    "documentation",
    "docs",
    "study",
    "quest",
    "quests",
    "notes",
    "explain",
    "what is",
    "how does",
  ];

  return triggers.some((t) => lower.includes(t));
}
