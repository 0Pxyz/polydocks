import fs from "node:fs/promises";
import path from "node:path";
import { pluginRegistry } from "../../plugins/registry";
import { ARTIFACT_WORD, FIX_WORD, UPDATE_WORD } from "../intent-words";

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
 * Maintainer-only file references live in HTML comments at the bottom of
 * each skill file. They must never reach the model prompt, so every
 * injection site strips them first (budgets are measured stripped too).
 */
export function stripSkillMetadata(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, "").trim();
}

/** Rough per-turn token estimate, same chars/4 convention as memory budgets. */
export function skillTokens(content: string): number {
  return Math.ceil(stripSkillMetadata(content).length / 4);
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
    "tracker",
    "reading list",
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

  // Canonical triggers. Deliberately narrow: bare words like "feed",
  // "docs", "quest" or "learn about" also appear in creation/update
  // requests ("create docs for the project directory", "add a quest",
  // "update the feed plugin") and must NOT route to research.
  const triggers = [
    "research",
    "search web",
    "search the web",
    "pesquisa na web",
    "pesquise na internet",
    "pesquise na web",
    "pesquisa",
    "pesquise",
    "curate",
    "find paper",
    "find article",
    "articles about",
    "artigos sobre",
    "artigos",
    "papers",
    "buscar fontes",
    "fontes",
    "sources",
    "latest on",
    "tutorial",
    "documentation",
    "documentação",
    "news",
    "noticias",
    "notícias",
  ];

  return triggers.some((t) => lower.includes(t));
}

/**
 * Domain skill selection (max two per turn, plus the always-loaded
 * app-overview). Each detector is keyword-only, PT+EN, with no model call.
 * Priority order below decides which two win when several match: repair and
 * creation intents outrank read-only ones so the agent patches in place
 * instead of recreating, and research outranks generic tab work.
 */

/** Broken artifact: patch it in place, never recreate. */
export function isPluginFixIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return FIX_WORD.test(lower) && ARTIFACT_WORD.test(lower);
}

/** Existing artifact must change: patch it in place, never recreate. */
export function isPluginUpdateIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return UPDATE_WORD.test(lower) && ARTIFACT_WORD.test(lower);
}

const DOCK_OPEN_WORD = /\b(open|abrir|abra|focusing|focus)\b/;
const DOCK_TAB_WORD = /\b(tab|aba|tabs|abas|tray|dock|browser|timer|pomodoro|plugin|tool|tools|experience|flashcard|flashcards)\b/;

/** Open/close/list/inspect dock tabs (not web content, not repairs). */
export function isDockTabsIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (isPluginFixIntent(prompt)) return false;
  const mentionsTarget = /\b(tab|tabs|aba|abas|tray|dock)\b/.test(lower);
  if (lower.includes("inspect tab") || lower.includes("list_tabs")) return true;
  if ((/close|fechar|fecha\b/.test(lower)) && mentionsTarget) return true;
  if ((/list|what|which|quais|minhas|mostrar|mostre|show\b/.test(lower)) && (mentionsTarget || /\b(tool|tools|ferramenta|ferramentas)\b/.test(lower))) return true;
  return DOCK_OPEN_WORD.test(lower) && DOCK_TAB_WORD.test(lower);
}

/** Dock experiences: pin/unpin, install/uninstall, rollback/versions, the experience noun. */
export function isDockExperienceIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (isPluginFixIntent(prompt)) return false;
  if (/\b(pin|pinned|unpin|afixad|desafixad)\b/.test(lower)) return true;
  if (/\b(uninstall|desinstal|rollback|revert|revert\w*|vers(ion|ão|oes|ions))\b/.test(lower)) return true;
  if (/\b(install|instala\w+)\b/.test(lower) && /\b(plugin|tool|ferramenta|store|timer|flashcards)\b/.test(lower)) return true;
  return /\bexperience\b/.test(lower) && /\b(dock|plugin|tab)\b/.test(lower);
}

/** Plugin capabilities and MCP adapters: discover, then invoke. */
export function isCapabilitiesIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    lower.includes("capabilit") ||
    lower.includes("mcp") ||
    lower.includes("invoke") ||
    lower.includes("integrat") ||
    lower.includes("wire ") ||
    lower.includes("connect data") ||
    lower.includes("conectar dados") ||
    lower.includes("dados externos") ||
    lower.includes("external data") ||
    lower.includes("use the timer") ||
    lower.includes("run the search")
  );
}

/** Agent home and workspace files plus long-term memory. */
export function isMemoryFilesIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    lower.includes("remember") ||
    lower.includes("recall") ||
    lower.includes("lembre") ||
    lower.includes("recordar") ||
    lower.includes("memoriz") ||
    lower.includes("não esqueça") ||
    lower.includes("nao esqueça") ||
    lower.includes("agent home") ||
    lower.includes("agent-home") ||
    lower.includes("my notes") ||
    lower.includes("minhas notas") ||
    lower.includes("save note") ||
    lower.includes("salvar nota") ||
    lower.includes("list files") ||
    lower.includes("listar arquivos") ||
    lower.includes("meus arquivos")
  );
}

/** Open a web article/video: reader territory, not a dock tab. */
export function isContentOpenIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (isPluginFixIntent(prompt) || isDockTabsIntent(prompt)) return false;
  return (
    /\bopen\b/.test(lower) &&
    (lower.includes("http") ||
      lower.includes("article") ||
      lower.includes("artigo") ||
      lower.includes("paper") ||
      lower.includes("video") ||
      lower.includes("vídeo") ||
      lower.includes("link") ||
      lower.includes("url"))
  );
}

/** Theme customization: appearance-only requests (never research/plugin). */
export function isThemeIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (!lower.trim()) return false;
  if (isPluginFixIntent(prompt) || isPluginUpdateIntent(prompt)) return false;
  if (/\b(theme|tema|wallpaper|wallpapers|background|fundo|papel de parede|accent|acento|dock style|dock position)\b/.test(lower)) {
    return true;
  }
  return false;
}

/** Isolated execution: run code, servers, previews (never conversational). */
export function isSandboxIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (!lower.trim()) return false;
  return (
    /\b(run|execute|executa|executar|rode|rodar|start|inicie|iniciar|serve|preview|deploy local|install deps|npm install|server|servidor|terminal|logs|console output)\b/.test(lower) &&
    /\b(code|código|codigo|app|application|aplicativo|script|server|servidor|command|comando|terminal|sandbox|preview|localhost|porta|port|test|teste|debug)\b/.test(lower)
  );
}

/** Verify-before-done protocol: state checks, not new work. */
export function isVerifyIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    lower.includes("verify") ||
    lower.includes("verific") ||
    lower.includes("check that") ||
    lower.includes("check if") ||
    lower.includes("is it done") ||
    lower.includes("did it work") ||
    lower.includes("funcionou") ||
    lower.includes("confere") ||
    lower.includes("esta pronto") ||
    lower.includes("está pronto")
  );
}

export type DomainSkillName =
  | "dock"
  | "theme"
  | "plugins"
  | "capabilities-and-mcp"
  | "content-and-reader"
  | "sandbox"
  | "memory-and-files"
  | "verify-and-report";

/**
 * Priority-ordered domain skill selection. Returns at most two skill names;
 * callers always add app-overview on top. Repair and verify-on-artifact come
 * first so a fix request reaches `plugins`, never a recreate path; a matched
 * capability invocation suppresses the research protocol; an explicit
 * open/close/list tab verb suppresses tool-synthesis matching on nouns like
 * "flashcard".
 */
export function selectDomainSkills(prompt: string): DomainSkillName[] {
  const picked: DomainSkillName[] = [];
  const add = (name: DomainSkillName) => {
    if (!picked.includes(name) && picked.length < 2) picked.push(name);
  };

  if (isPluginFixIntent(prompt) || isPluginUpdateIntent(prompt)) add("plugins");
  if (isVerifyIntent(prompt) && ARTIFACT_WORD.test(prompt.toLowerCase())) add("plugins");
  if (isThemeIntent(prompt)) add("theme");
  if (isCapabilitiesIntent(prompt)) add("capabilities-and-mcp");
  if (isSandboxIntent(prompt)) add("sandbox");
  if (!picked.includes("capabilities-and-mcp") && (isResearchIntent(prompt) || isContentOpenIntent(prompt)))
    add("content-and-reader");
  if (isDockTabsIntent(prompt)) add("dock");
  if (isDockExperienceIntent(prompt)) add("dock");
  if (isPluginSynthesisIntent(prompt) && !picked.includes("dock")) add("plugins");
  if (isMemoryFilesIntent(prompt)) add("memory-and-files");
  if (isVerifyIntent(prompt)) add("verify-and-report");
  return picked;
}
