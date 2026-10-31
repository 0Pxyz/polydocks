import type { AgentTool } from "./tools/types";
import { toResponsesName, toResponsesTools } from "./responses";

/**
 * Native tool search replaces the custom `find_capabilities` root plus
 * hand-rolled surface filters (#222, supersedes #203 and #205).
 *
 * The Responses path groups the intent-scoped tool set into namespace tools
 * and defers the schemas inside them; a single `{"type": "tool_search"}`
 * entry lets the API load what the model needs on demand. The capability
 * bus stays the execution backend, so policy, receipts and audit apply
 * identically — only the discovery mechanism changes.
 *
 * Verified against https://dev.meta.ai/docs (/tool-search, /tool-calling):
 * - Tool search runs on Responses/Messages only, never Chat Completions.
 *   The Chat fallback keeps the flat catalog with `find_capabilities`.
 * - `defer_loading: true` goes on the functions INSIDE a namespace, never
 *   on the namespace object; exactly one `tool_search` per request.
 * - Hosted mode (full inventory declared up front) is used: the per-turn
 *   scoped set is static within a request. Client-executed search (for
 *   tenant-dependent availability) is not needed — availability filtering
 *   already happens before this builder via the intent denylists, and the
 *   bus re-checks policy at invoke time.
 * - Constraints honored: hosted search needs >= 1 deferred tool (guarded
 *   below — a fully-immediate set omits `tool_search`); not combined with
 *   structured output (the loop never sets a response format on agent
 *   turns); reasoning effort is never `"none"` (allowlisted in loop.ts);
 *   the loaded set stays stable because the same tools are resent every
 *   turn of the stateless replay.
 * - Function names allow at most one dot: namespace names carry zero dots,
 *   inner function names reuse the sanitized (#221) tool names (<= 1 dot).
 * - Namespaces stay under ~10 functions: any group that overflows is
 *   chunked (`<ns>`, `<ns>_2`, …) so the constraint holds structurally.
 */

/** Custom discovery/search roots retired on the Responses path, where the
 *  native built-ins take over: `find_capabilities` (#222, native tool
 *  search) and `search_web` (#223, built-in server-side grounding). The
 *  Chat fallback keeps the flat catalog with both. `fetch_page` stays —
 *  it does what grounding does not: capped full-page reads persisted to
 *  workspace sources. Domain-typed capability search (`cap_search_*`,
 *  `cap_browser_*`) stays deferred in the research namespace for power
 *  use the built-in's plain grounding does not cover. */
export const RESPONSES_SUPERSEDED = new Set(["find_capabilities", "search_web"]);

/** Names the built-in `web_search` tool reserves server-side. A developer
 *  function with one of these names in the same request is HTTP 400, so
 *  the loop checks before enabling grounding (see #223). */
export const WEB_SEARCH_RESERVED_NAMES = new Set(["browser.search", "browser.open", "browser.find"]);

/** True when an offered Responses function name collides with a name the
 *  built-in `web_search` reserves — grounding must stay off that turn. */
export function hasReservedWebSearchCollision(responseNames: Iterable<string>): boolean {
  for (const name of responseNames) {
    if (WEB_SEARCH_RESERVED_NAMES.has(name)) return true;
  }
  return false;
}

/** `invoke_capability` stays immediate: skills name capability ids
 *  directly (e.g. `sources.add via invoke_capability`), so the escape
 *  hatch must be callable without a search round-trip. */
const IMMEDIATE_TOOLS = new Set(["invoke_capability"]);

const MAX_FUNCTIONS_PER_NAMESPACE = 9;

const NAMESPACE_DESCRIPTIONS: Record<string, string> = {
  dock: "Dock surface controls: open, close, pin and locate tools in the user's dock.",
  nav: "In-dock navigation: move focus between tools and toggle the chat panel.",
  plugins: "Plugin lifecycle: create, edit, install, operate and publish dock plugins.",
  files: "Workspace files: list, read, write and search user files.",
  research: "Web research and sources: search the web, fetch pages, open results.",
  memory: "Long-term memory: recall past context and record durable notes.",
  media: "Appearance and media: themes, generated images and icon lookup.",
  sandbox: "Sandbox execution: run code and manage files and previews in the agent sandbox.",
  workspace: "Workspace state: context, sessions, tasks and saved artifacts.",
  inspect: "Execution introspection: inspect past tool and capability runs.",
  sources: "Research sources: save, list and open source URLs for a workspace.",
  cities: "Structured demo content: cities, quests and notes.",
  general: "General utilities that fit no other namespace.",
};

function namespaceDescription(name: string): string {
  return (
    NAMESPACE_DESCRIPTIONS[name] ??
    `Capabilities from the ${name} plugin: related actions grouped for tool search.`
  );
}

/** Static tool name -> namespace. Capability-derived (`cap.*`) tools and
 *  anything unlisted fall through to the plugin/prefix rules below. */
const STATIC_NAMESPACE: Record<string, string> = {
  dock_search: "dock",
  dock_pin: "dock",
  dock_unpin: "dock",
  dock_close: "dock",
  "dock.open": "dock",
  "dock.close": "dock",
  "dock.pin": "dock",
  "dock.unpin": "dock",
  "dock.list": "dock",
  "dock.focus": "nav",
  "dock.next": "nav",
  "dock.prev": "nav",
  "dock.background": "nav",
  "chat.toggle": "nav",
  "plugins.create": "plugins",
  "plugins.edit": "plugins",
  "plugins.install": "plugins",
  "plugins.uninstall": "plugins",
  "plugins.operate": "plugins",
  "plugins.rollback": "plugins",
  "plugins.activate": "plugins",
  "plugins.deactivate": "plugins",
  create_plugin: "plugins",
  modify_plugin: "plugins",
  operate_plugin: "plugins",
  publish_plugin: "plugins",
  promote_to_plugin: "plugins",
  inspect_experience: "plugins",
  install_plugin: "plugins",
  rollback_plugin: "plugins",
  list_files: "files",
  read_file: "files",
  write_file: "files",
  edit_file: "files",
  search_files: "files",
  search_web: "research",
  fetch_page: "research",
  open_source: "research",
  recall_memory: "memory",
  record_memory: "memory",
  apply_theme: "media",
  generate_image: "media",
  search_icons: "media",
  list_icon_categories: "media",
  sandbox_exec: "sandbox",
  sandbox_write_file: "sandbox",
  sandbox_read_file: "sandbox",
  sandbox_list_files: "sandbox",
  sandbox_serve: "sandbox",
  sandbox_logs: "sandbox",
  sandbox_status: "sandbox",
  sandbox_terminate: "sandbox",
  list_sessions: "workspace",
  inspect_session: "workspace",
  list_tasks: "workspace",
  list_artifacts: "workspace",
  read_artifact: "workspace",
  inspect_execution: "inspect",
  list_recent_executions: "inspect",
};

/** Capability pluginId -> namespace (merges same-domain static tools and
 *  capability tools so the model searches one coherent group). */
const CAPABILITY_PLUGIN_NAMESPACE: Record<string, string> = {
  sources: "sources",
  search: "research",
  browser: "research",
  workspace: "workspace",
  writing: "files",
  sandbox: "sandbox",
  cities: "cities",
};

function capabilityNamespaceFor(originalName: string): string {
  // Original dynamic names are `cap.<pluginId>.<action...>`; the sanitized
  // form is `cap_<pluginId>_<action...>` (#221 reversible map).
  const inner = originalName.startsWith("cap.")
    ? originalName.slice("cap.".length)
    : originalName.startsWith("cap_")
      ? originalName.slice("cap_".length)
      : originalName;
  const pluginId = inner.split(/[._]/)[0] || "general";
  return CAPABILITY_PLUGIN_NAMESPACE[pluginId] ?? pluginId;
}

function namespaceFor(originalName: string, opts?: { builtinWebSearch?: boolean }): string | null {
  // find_capabilities is always retired (native tool search is the route).
  // Custom search_web is retired only when built-in grounding is on;
  // otherwise it stays namespaced as the fallback search route.
  if (originalName === "search_web" && opts?.builtinWebSearch === false) {
    return "research";
  }
  if (RESPONSES_SUPERSEDED.has(originalName)) return null;
  if (IMMEDIATE_TOOLS.has(originalName)) return null;
  const staticNs = STATIC_NAMESPACE[originalName];
  if (staticNs) return staticNs;
  if (originalName.startsWith("cap.") || originalName.startsWith("cap_")) {
    return capabilityNamespaceFor(originalName);
  }
  return "general";
}

export interface ResponsesNamespaceInput {
  type: "namespace";
  name: string;
  description: string;
  tools: Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    defer_loading: boolean;
  }>;
}

export interface BuiltResponsesTools {
  /** Full `tools` array for `client.responses.create`. */
  tools: any[];
  /** Sanitized response name -> registry name (1:1 coverage). */
  nameMap: Map<string, string>;
  /** Namespaces declared (for tests and debug logs). */
  namespaces: ResponsesNamespaceInput[];
}

/**
 * Group the intent-scoped tools into deferred namespaces for the
 * Responses path. Coverage stays 1:1 with the input minus the superseded
 * roots (`find_capabilities`, custom `search_web`); denylist enforcement
 * happens before this builder (the input `scopedTools` is already
 * filtered), and the bus re-checks policy at invoke time — so whole-tool
 * and per-action denylists stay enforced.
 *
 * Set `builtinWebSearch: false` when grounding is unavailable that turn
 * (reserved-name collision): the custom `search_web` alias is kept
 * namespaced instead of retired so the turn still has a search route.
 */
export function buildResponsesTools(
  scopedTools: AgentTool[],
  opts?: { builtinWebSearch?: boolean }
): BuiltResponsesTools {
  const builtinWebSearch = opts?.builtinWebSearch !== false;
  const nameMap = new Map<string, string>();
  const grouped = new Map<string, AgentTool[]>();
  const immediate: AgentTool[] = [];

  for (const tool of scopedTools) {
    if (builtinWebSearch && RESPONSES_SUPERSEDED.has(tool.name)) {
      // Retired: the native built-in is the route — not offered, not
      // resolvable, so the model never reaches for the custom alias.
      continue;
    }
    // Fallback: keep the custom alias namespaced when grounding is off
    // (namespaceFor routes it to research when builtinWebSearch is false).
    const ns = namespaceFor(tool.name, { builtinWebSearch });
    if (ns === null) {
      if (IMMEDIATE_TOOLS.has(tool.name)) {
        nameMap.set(toResponsesName(tool.name), tool.name);
        immediate.push(tool);
      }
      continue;
    }
    nameMap.set(toResponsesName(tool.name), tool.name);
    const list = grouped.get(ns) ?? [];
    list.push(tool);
    grouped.set(ns, list);
  }

  const namespaces: ResponsesNamespaceInput[] = [];
  for (const [ns, tools] of [...grouped.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    // Chunk overflow so every namespace stays under ~10 functions.
    const chunks: AgentTool[][] = [];
    for (let i = 0; i < tools.length; i += MAX_FUNCTIONS_PER_NAMESPACE) {
      chunks.push(tools.slice(i, i + MAX_FUNCTIONS_PER_NAMESPACE));
    }
    chunks.forEach((chunk, idx) => {
      const name = idx === 0 ? ns : `${ns}_${idx + 1}`;
      namespaces.push({
        type: "namespace",
        name,
        description:
          idx === 0
            ? namespaceDescription(ns)
            : `${namespaceDescription(ns)} (continued, part ${idx + 1})`,
        tools: toResponsesTools(chunk).map((fn) => ({ ...fn, defer_loading: true })),
      });
    });
  }

  const immediateFns = toResponsesTools(immediate);
  const hasDeferred = namespaces.some((n) => n.tools.some((t) => t.defer_loading));
  const tools: any[] = [...namespaces, ...immediateFns];
  // Hosted search needs at least one deferred tool; a deferred tool
  // without tool_search is HTTP 400 — include it exactly when deferred
  // functions exist, exactly once per request.
  if (hasDeferred) tools.push({ type: "tool_search" });

  return { tools, nameMap, namespaces };
}

/** Resolve a function_call name (+ optional namespace) to a registry name. */
export function resolveResponsesToolName(
  nameMap: Map<string, string>,
  rawName: string,
  namespace?: string
): string {
  const direct = nameMap.get(rawName);
  if (direct) return direct;
  if (namespace) {
    const qualified = nameMap.get(`${namespace}.${rawName}`);
    if (qualified) return qualified;
    const underscored = nameMap.get(`${namespace}_${rawName}`);
    if (underscored) return underscored;
  }
  // Namespace-prefixed guess for a flat function ("media.apply_theme"):
  // the model treats the namespace as a prefix, semantically identical to
  // (namespace, bare name). Resolve the remainder so a natural guess does
  // not hard-fail as "not registered in catalog".
  const dot = rawName.indexOf(".");
  if (dot > 0) {
    const suffix = nameMap.get(rawName.slice(dot + 1));
    if (suffix) return suffix;
  }
  return rawName;
}
