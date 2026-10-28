import fs from "node:fs/promises";
import path from "node:path";
import { pluginRegistry } from "../../plugins/registry";

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

  // If prompt is clearly about world map or knowledge territory planning, avoid false tab trigger
  if (
    isWorldPlanningIntent(prompt) &&
    !lower.includes("tab") &&
    !lower.includes("aba") &&
    !lower.includes("dock") &&
    !lower.includes("micro-app") &&
    !lower.includes("flashcard")
  ) {
    return false;
  }

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
    "interactive concept graph",
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
 * Heuristic detector for whether user prompt involves planning or expanding knowledge domains, world regions, or cities.
 */
export function isWorldPlanningIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const triggers = [
    "nova area",
    "nova área",
    "area de conhecimento",
    "área de conhecimento",
    "knowledge area",
    "knowledge domain",
    "knowledge territory",
    "knowledge map",
    "world map",
    "mapa do mundo",
    "plan map",
    "plan the map",
    "expand map",
    "expand the map",
    "build city",
    "criar cidade",
    "nova cidade",
    "fundar cidade",
    "found city",
    "novo tema",
    "novo topico",
    "novo tópico",
    "new topic",
    "new subject",
    "new domain",
    "quero aprender",
    "quero estudar",
    "aprender sobre",
    "estudar sobre",
    "want to learn",
    "learn about",
    "master topic",
  ];

  return triggers.some((t) => lower.includes(t));
}

/**
 * Heuristic detector for whether user prompt involves web research, discovery, or content curation.
 * Evaluates triggers declared in plugin manifests, falling back to canonical defaults.
 */
export function isResearchIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();

  try {
    const searchPlugin = pluginRegistry.get("search");
    if (searchPlugin?.manifest.skill?.triggers) {
      if (searchPlugin.manifest.skill.triggers.some((t) => lower.includes(t.toLowerCase()))) {
        return true;
      }
    }
  } catch {
    // Non-fatal fallback
  }

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
