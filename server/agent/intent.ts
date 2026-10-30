import { isResearchIntent, isWorldPlanningIntent } from "./skills";
import { UPDATE_WORD, ARTIFACT_WORD, FIX_WORD } from "./intent-words";

/**
 * Deterministic intent classification for the agent loop.
 *
 * Decides what KIND of work the user's message requests BEFORE any tool is
 * offered or called, so the loop can scope context, skills, and the tool
 * catalog to the task. Keyword rules only — no model call, no side effects.
 * Misrouting (e.g. web research for a theme change) is prevented here,
 * not by suppressing progress messages in the UI.
 */

export type AgentIntent = "theme" | "plugin_update" | "plugin_fix" | "research" | "city" | "general";

export interface IntentHints {
  hasImageAttachments?: boolean;
}

const THEME_CORE = /\b(wallpaper|fundo|papel de parede|theme|tema)\b/;
const BACKGROUND_WORD = /\b(background)\b/;
const THEME_ACTION = /\b(my|this|app|change|set|add|use|apply|meu|minha|este|esta|esse|essa|mudar|colocar|usar|aplicar|trocar)\b/;

export function classifyIntent(prompt: string, hints: IntentHints = {}): AgentIntent {
  const lower = (prompt || "").toLowerCase();
  if (!lower.trim()) return "general";

  // Broken artifact reports (fix in place, never recreate) outrank theme
  // and research: "fix the reader background" is a repair, not a theme change.
  if (FIX_WORD.test(lower) && ARTIFACT_WORD.test(lower)) return "plugin_fix";

  // Update an existing artifact (never recreate it). Checked before theme:
  // "melhora o plugin ... não se adapta ao tema ... fundo" restyles the
  // artifact itself, it does not change the app theme. Theme words alone
  // (without an artifact target) still fall through to the theme intent.
  if (UPDATE_WORD.test(lower) && ARTIFACT_WORD.test(lower)) return "plugin_update";

  // Theme customization (e.g. "Add this background to my theme" + image).
  // Reached only when no artifact update/fix matched above.
  if (THEME_CORE.test(lower)) return "theme";
  if (BACKGROUND_WORD.test(lower) && (THEME_ACTION.test(lower) || hints.hasImageAttachments)) {
    return "theme";
  }

  // Research and city planning reuse the existing skill matchers so there
  // is exactly one definition of those intents.
  if (isResearchIntent(prompt)) return "research";
  if (isWorldPlanningIntent(prompt)) return "city";

  return "general";
}

/**
 * Tools that must NOT be offered for a given intent. The model can only
 * call what it is offered, so exclusion here is a hard routing safeguard.
 */
export const INTENT_TOOL_DENYLIST: Record<AgentIntent, readonly string[]> = {
  // Theme edits are local UI operations: no research, no cities, no
  // artifact synthesis, no writes outside the theme contract.
  theme: [
    "search_web",
    "fetch_page",
    "plan_map",
    "plan_ascii_world",
    "build_city",
    "place_city",
    "set_map",
    "list_maps",
    "create_tab",
    "update_tab",
    "delete_tab",
    "create_plugin",
    "modify_plugin",
    "operate_plugin",
    "publish_plugin",
    "promote_to_plugin",
    "open_tab",
    "open_intent",
    "write_city_file",
    "write_file",
    "edit_file",
    "write_file_safe",
    "get_city_context",
    "inspect_tab",
    "list_tabs",
    "search_icons",
    "list_icon_categories",
  ],
  // Updates must reuse the existing artifact, never synthesize a duplicate.
  plugin_update: ["create_tab", "create_plugin"],
  // Fixes must patch the existing artifact in place: no recreate, no delete.
  plugin_fix: ["create_tab", "create_plugin", "delete_tab"],
  research: [],
  city: [],
  general: [],
};
