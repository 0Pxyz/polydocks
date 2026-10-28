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
export function isPluginSynthesisIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();

  // Negative filter: general informational questions, conversational greetings, pure search queries
  if (
    lower.startsWith("what is") ||
    lower.startsWith("what are") ||
    lower.startsWith("o que e") ||
    lower.startsWith("o que é") ||
    lower.startsWith("how does") ||
    lower.startsWith("como funciona") ||
    lower.startsWith("explain") ||
    lower.startsWith("explica") ||
    lower.startsWith("why is") ||
    lower.startsWith("por que")
  ) {
    if (
      !lower.includes("build") &&
      !lower.includes("create") &&
      !lower.includes("cria") &&
      !lower.includes("crie") &&
      !lower.includes("tool") &&
      !lower.includes("plugin")
    ) {
      return false;
    }
  }

  const triggers = [
    "build a plugin",
    "create a plugin",
    "create plugin",
    "build plugin",
    "crie um plugin",
    "criar plugin",
    "build a tool",
    "create a tool",
    "crie uma ferramenta",
    "criar ferramenta",
    "pomodoro",
    "pomodoro timer",
    "timer",
    "cronometro",
    "cronômetro",
    "kanban",
    "kanban board",
    "todo list",
    "task manager",
    "calculator",
    "calculadora",
    "flashcard",
    "flashcards",
    "micro-app",
    "modify plugin",
    "update plugin",
    "modificar plugin",
    "atualizar plugin",
    "operate plugin",
    "publish plugin",
    "publicar plugin",
  ];

  return triggers.some((t) => lower.includes(t));
}

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

  // Negative filter: general informational questions, greetings, explanations
  if (
    lower.startsWith("what is") ||
    lower.startsWith("what are") ||
    lower.startsWith("o que e") ||
    lower.startsWith("o que é") ||
    lower.startsWith("how does") ||
    lower.startsWith("como funciona") ||
    lower.startsWith("explain") ||
    lower.startsWith("explica") ||
    lower.startsWith("why is") ||
    lower.startsWith("por que")
  ) {
    if (
      !lower.includes("city") &&
      !lower.includes("cidade") &&
      !lower.includes("world map") &&
      !lower.includes("mapa") &&
      !lower.includes("territory")
    ) {
      return false;
    }
  }

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
    "knowledge city",
    "cidade do conhecimento",
    "create city",
    "create a city",
    "create a knowledge city",
    "novo tema",
    "novo topico",
    "novo tópico",
    "new topic",
    "new domain",
    "quero aprender sobre física quântica",
    "want to learn neuroscience",
  ];

  return triggers.some((t) => lower.includes(t));
}

/**
 * Heuristic detector for whether user prompt involves web research, discovery, or content curation.
 * Evaluates triggers declared in plugin manifests, falling back to canonical defaults.
 */
export function isResearchIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();

  // Negative filter for greetings and general short conversation
  if (
    lower === "hey" ||
    lower === "hi" ||
    lower === "hello" ||
    lower === "ola" ||
    lower === "olá" ||
    lower.startsWith("what time") ||
    lower.startsWith("change accent")
  ) {
    return false;
  }

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
    "search web",
    "search the web",
    "pesquisa na web",
    "pesquise na internet",
    "pesquise na web",
    "find paper",
    "papers",
    "feed",
    "curate",
    "pesquisa",
    "pesquise",
    "buscar fontes",
    "fontes",
    "sources",
    "latest on",
    "tutorial",
    "documentation",
    "docs",
    "quest",
    "quests",
    "learn about",
  ];

  return triggers.some((t) => lower.includes(t));
}
