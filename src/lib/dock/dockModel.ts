/**
 * Dock model: the single action layer for dock state.
 *
 * Both the UI (dock bar, search palette) and the agent (dock_* tools, whose
 * effects the client applies through this module) share these pure functions,
 * so manual and agent-driven use always converge on the same state.
 *
 * State itself lives in `useDockStore` (persisted pinned order); everything
 * that decides *what* the state becomes lives here, which keeps it unit
 * testable without a DOM.
 */

export type DockItemKind = "builtin" | "plugin" | "tab" | "store" | "create";

export type DockItemStatus = "ok" | "failed";

export interface DockItem {
  id: string;
  label: string;
  /** One-line, human-readable description. Never a code id or path. */
  description: string;
  /** Icon key resolved through the icon adapter. */
  icon: string;
  kind: DockItemKind;
  /** System items (the map) are always present: no unpin, close or delete. */
  system?: boolean;
  status?: DockItemStatus;
  errorMessage?: string;
  /** Live count pill shown on the dock icon (only for real backing data). */
  badge?: string | number;
  /** Extra line in the dock tooltip (e.g. quest progress). */
  tooltipDetail?: string;
}

export interface DockLayoutState {
  /** Pinned item ids in bar order. */
  pinnedIds: string[];
  /** Open item ids, most recently opened first. */
  openIds: string[];
}

/** Items that are part of the dock itself and can never be unpinned or closed. */
export const SYSTEM_TOOL_IDS = new Set(["agent"]);

/** Fallback pinned order for a fresh layout (all ids must exist in the catalog). */
export const DEFAULT_PINNED_IDS = ["agent", "plugins", "settings"];

/**
 * One-way migration for persisted layouts: the Plugin Store is not a dock
 * item, so existing pins drop it without deleting anything else. Pure so
 * both the store and tests share it.
 */
export function migratePinnedIds(pinnedIds: string[]): string[] {
  const migrated = pinnedIds.filter((id) => id !== "store");
  return migrated.length > 0 ? migrated : [...DEFAULT_PINNED_IDS];
}

export type DockSectionId = "docked" | "yours" | "store" | "create";

export interface DockSection {
  id: DockSectionId;
  title: string;
  items: DockItem[];
}

/**
 * Score a dock item against a search query. Higher is better; -1 hides it.
 * Label prefix beats label substring beats description match.
 */
export function scoreDockItem(item: DockItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const label = item.label.toLowerCase();
  const description = item.description.toLowerCase();
  const id = item.id.toLowerCase();
  if (label.startsWith(q)) return 100;
  if (label.includes(q)) return 50;
  if (id === q) return 40;
  if (id.includes(q)) return 20;
  if (description.includes(q)) return 10;
  return -1;
}

/**
 * Build the palette sections in fixed order: docked, yours, store, create.
 * `catalog` holds everything already available (builtins, tabs, installed
 * plugins); `store` holds registry plugins that are not installed.
 */
export function buildDockSections(args: {
  catalog: DockItem[];
  store: DockItem[];
  layout: DockLayoutState;
  query: string;
  createForQuery: (query: string) => DockItem[];
}): DockSection[] {
  const { catalog, store, layout, query, createForQuery } = args;
  const pinned = new Set(layout.pinnedIds);
  const open = new Set(layout.openIds);

  const rank = (items: DockItem[]): DockItem[] =>
    items
      .map((item) => ({ item, score: scoreDockItem(item, query) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);

  const docked = rank(catalog.filter((item) => pinned.has(item.id) || open.has(item.id)));
  const yours = rank(
    catalog.filter((item) => !pinned.has(item.id) && !open.has(item.id) && !item.system)
  );
  const storeItems = rank(store);
  const create = query.trim() ? createForQuery(query.trim()) : [];

  return [
    { id: "docked", title: "In your dock", items: docked },
    { id: "yours", title: "Your tools", items: yours },
    { id: "store", title: "Store", items: storeItems },
    { id: "create", title: "Create with agent", items: create },
  ];
}

/** Generate "create with agent" rows from the current query (never static). */
export function createItemsForQuery(query: string): DockItem[] {
  const q = query.trim();
  if (!q) return [];
  const short = q.length > 40 ? `${q.slice(0, 40)}…` : q;
  return [
    {
      id: `create:flashcards:${q}`,
      label: `Flashcards for ${short}`,
      description: `Ask the agent to build flashcards for ${short}`,
      icon: "cards",
      kind: "create",
    },
    {
      id: `create:compare:${q}`,
      label: `Compare sources on ${short}`,
      description: `Ask the agent to compare two sources on ${short}`,
      icon: "scales",
      kind: "create",
    },
    {
      id: `create:timeline:${q}`,
      label: `A timeline of ${short}`,
      description: `Ask the agent to build a timeline of ${short}`,
      icon: "clock",
      kind: "create",
    },
  ];
}

/**
 * Static "create with agent" rows for an empty query, mirroring the original
 * suggestions: city-aware when a city context exists, generic otherwise.
 */
export function getStaticCreateRows(cityName?: string): DockItem[] {
  const city = cityName?.trim();
  const labels = city
    ? [`Flashcards for ${city}`, `Compare two sources on ${city}`, `A timeline of ${city}`]
    : ["Flashcards", "A reading list", "A timeline"];
  const descriptions = city
    ? [
        `Ask the agent to build flashcards for ${city}`,
        `Ask the agent to compare two sources on ${city}`,
        `Ask the agent to build a timeline of ${city}`,
      ]
    : [
        "Ask the agent to build flashcards",
        "Ask the agent to build a reading list",
        "Ask the agent to build a timeline",
      ];
  return labels.map((label, i) => ({
    id: `create:static:${i}${city ? `:${city}` : ""}`,
    label,
    description: descriptions[i],
    icon: "cards",
    kind: "create" as const,
  }));
}

const EMPTY_QUERY_MAX_ROWS = 6;
const EMPTY_QUERY_OPEN_MAX = 2;
const EMPTY_QUERY_CREATE_COUNT = 3;

/**
 * Curates the empty-query panel so it stays small: open items first (if
 * any), then unpinned tools, then the static create rows. Pinned,
 * non-open items are hidden here (already in the dock above) and appear
 * once the user types.
 */
export function sliceEmptyQueryRows(args: {
  open: DockItem[];
  yours: DockItem[];
  /** Extra fixed rows (e.g. the Browse store row) that also take panel space. */
  reserved?: number;
}): { open: DockItem[]; yours: DockItem[] } {
  const open = args.open.slice(0, EMPTY_QUERY_OPEN_MAX);
  const yours = args.yours.slice(
    0,
    Math.max(0, EMPTY_QUERY_MAX_ROWS - EMPTY_QUERY_CREATE_COUNT - open.length - (args.reserved ?? 0))
  );
  return { open, yours };
}

/**
 * The city's contextual tools. Shown in the dock while inside a city, never
 * pinned globally. Icons resolve through the shared icon adapter.
 */
export const CITY_TOOL_IDS = [
  "sources",
  "notes",
  "files",
  "quests",
  "flashcards",
  "terminal",
  "browser",
] as const;

export type CityToolId = (typeof CITY_TOOL_IDS)[number];

export interface CityToolCounts {
  sources: number;
  notes: number;
  quests: number;
  doneQuests: number;
}

/**
 * Builds the city dock set with live badges and tooltip details from real
 * workspace counts. No badge is invented: tools without backing data
 * (files, terminal) render badge-free.
 */
export function buildCityDockTools(summary?: CityToolCounts): DockItem[] {
  const questsDetail =
    summary && summary.quests > 0
      ? summary.doneQuests >= summary.quests
        ? `${summary.quests} ${summary.quests === 1 ? "quest" : "quests"} done`
        : `${summary.doneQuests} of ${summary.quests} quests`
      : undefined;
  return [
    { id: "agent", label: "Agent", description: "Talk to the dock agent", icon: "agent", kind: "builtin", system: true },
    { id: "maps", label: "World Map", description: "Travel the knowledge map", icon: "maps", kind: "builtin" },
    {
      id: "sources",
      label: "Sources",
      description: "Saved sources",
      icon: "sources",
      kind: "builtin",
      badge: summary && summary.sources > 0 ? summary.sources : undefined,
    },
    {
      id: "notes",
      label: "Notes",
      description: "Synthesized notes",
      icon: "notes",
      kind: "builtin",
      badge: summary && summary.notes > 0 ? summary.notes : undefined,
    },
    { id: "files", label: "City Files", description: "City workspace files", icon: "files", kind: "builtin" },
    {
      id: "quests",
      label: "Quests",
      description: "Mastery quests and progress",
      icon: "quests",
      kind: "builtin",
      badge: summary && summary.quests > 0 ? summary.quests : undefined,
      tooltipDetail: questsDetail,
    },
    {
      id: "flashcards",
      label: "Flashcards",
      description: "Interactive flashcards",
      icon: "flashcards",
      kind: "builtin",
      tooltipDetail:
        summary && summary.sources > 0 ? "Ready" : summary ? "Add sources to synthesize" : undefined,
    },
    { id: "terminal", label: "Terminal", description: "City terminal", icon: "terminal", kind: "builtin" },
    { id: "settings", label: "Settings", description: "Dock appearance and theme", icon: "settings", kind: "builtin" },
  ];
}

/**
 * Display order for the bar: pinned first (bar stays curated), then
 * contextual city tools, then open unpinned items. Unknown ids drop out;
 * the caller slices to the width-derived cap.
 */
export function orderVisibleIds(args: {
  all: string[];
  pinned: string[];
  contextual?: string[];
  open?: string[];
  cap: number;
}): string[] {
  const known = new Set(args.all);
  const ordered: string[] = [];
  const seen = new Set<string>();
  const take = (id: string) => {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  };
  for (const id of args.pinned) take(id);
  for (const id of args.contextual || []) take(id);
  for (const id of args.open || []) take(id);
  return ordered.slice(0, Math.max(1, args.cap));
}
/**
 * How many pinned items fit in the bar. Derived from measured available
 * width, never a magic item count: each slot takes `itemSize` px and
 * `reserved` px stay free for the add button, ghost slot and padding.
 */
export function computeVisibleCap(
  availableWidth: number,
  itemSize = 46,
  reserved = 72
): number {
  return Math.max(1, Math.floor((availableWidth - reserved) / itemSize));
}

export type DockDirectiveOp = "open" | "close" | "pin" | "unpin";

export interface DockDirective {
  op: DockDirectiveOp;
  id: string;
}

export interface DockDirectiveResult {
  ok: boolean;
  message: string;
  layout: DockLayoutState;
}

/**
 * Apply one dock directive and read the resulting state back. The returned
 * `layout` is the source of truth after the call; `ok: false` means the
 * post-condition failed and the caller must surface `message` visibly.
 *
 * Closing or unpinning never deletes: both only edit `layout`. Deletion
 * stays a separate, explicitly approved flow elsewhere.
 */
export function applyDockDirective(
  layout: DockLayoutState,
  directive: DockDirective,
  knownIds: Set<string>
): DockDirectiveResult {
  const { op, id } = directive;

  if (!knownIds.has(id)) {
    return { ok: false, message: `No dock item "${id}" found.`, layout };
  }
  if ((op === "unpin" || op === "close") && SYSTEM_TOOL_IDS.has(id)) {
    return { ok: false, message: `The agent is always in the dock and cannot be removed.`, layout };
  }

  if (op === "pin") {
    if (layout.pinnedIds.includes(id)) {
      return { ok: true, message: `"${id}" is already pinned.`, layout };
    }
    const next = { ...layout, pinnedIds: [...layout.pinnedIds, id] };
    return next.pinnedIds.includes(id)
      ? { ok: true, message: `Pinned "${id}".`, layout: next }
      : { ok: false, message: `Pinning "${id}" did not stick.`, layout };
  }

  if (op === "unpin") {
    if (!layout.pinnedIds.includes(id)) {
      return { ok: true, message: `"${id}" was not pinned.`, layout };
    }
    const next = { ...layout, pinnedIds: layout.pinnedIds.filter((item) => item !== id) };
    return !next.pinnedIds.includes(id)
      ? { ok: true, message: `Unpinned "${id}". It stays installed and searchable.`, layout: next }
      : { ok: false, message: `Unpinning "${id}" did not stick.`, layout };
  }

  if (op === "open") {
    const rest = layout.openIds.filter((item) => item !== id);
    const next = { ...layout, openIds: [id, ...rest] };
    return next.openIds[0] === id
      ? { ok: true, message: `Opened "${id}".`, layout: next }
      : { ok: false, message: `Opening "${id}" did not stick.`, layout };
  }

  // close
  if (!layout.openIds.includes(id)) {
    return { ok: true, message: `"${id}" is already closed. Nothing was deleted.`, layout };
  }
  const next = { ...layout, openIds: layout.openIds.filter((item) => item !== id) };
  return !next.openIds.includes(id)
    ? { ok: true, message: `Closed "${id}". Nothing was deleted.`, layout: next }
    : { ok: false, message: `Closing "${id}" did not stick.`, layout };
}

/**
 * One-line human descriptions for builtin dock items, shown in search rows.
 * Kept here (not scattered across components) so every surface agrees.
 */
export const DOCK_TOOL_DESCRIPTIONS: Record<string, string> = {
  agent: "Talk to the dock agent",
  maps: "Travel the knowledge map",
  browser: "Browse the web with a real browser",
  notes: "Synthesized notes",
  files: "City workspace files",
  papers: "Reading list and papers",
  sources: "Saved sources",
  quests: "Mastery quests and progress",
  flashcards: "Interactive flashcards",
  terminal: "City terminal",
  settings: "Dock appearance and theme",
  theme: "Dock appearance and theme",
  store: "Community plugin store",
  plugins: "Installed plugins",
  city: "Current city workspace",
};

/**
 * The builtin catalog the search palette can resolve without any fetch.
 * Mirrors the server builtin list (server/agent/tools/dockCatalog.ts).
 */
export const DOCK_CORE_CATALOG: DockItem[] = [
  { id: "agent", label: "Agent", description: "Talk to the dock agent", icon: "agent", kind: "builtin", system: true },
  { id: "maps", label: "World Map", description: "Travel the knowledge map", icon: "maps", kind: "builtin" },
  { id: "browser", label: "Browser", description: "Browse the web with a real browser", icon: "browser", kind: "builtin" },
  { id: "notes", label: "Notes", description: "Synthesized notes", icon: "notes", kind: "builtin" },
  { id: "files", label: "City Files", description: "City workspace files", icon: "files", kind: "builtin" },
  { id: "papers", label: "Papers", description: "Reading list and papers", icon: "papers", kind: "builtin" },
  { id: "sources", label: "Sources", description: "Saved sources", icon: "sources", kind: "builtin" },
  { id: "quests", label: "Quests", description: "Mastery quests and progress", icon: "quests", kind: "builtin" },
  { id: "flashcards", label: "Flashcards", description: "Interactive flashcards", icon: "flashcards", kind: "builtin" },
  { id: "terminal", label: "Terminal", description: "City terminal", icon: "terminal", kind: "builtin" },
  { id: "settings", label: "Settings", description: "Dock appearance and theme", icon: "settings", kind: "builtin" },
  // No store entry: the Plugin Store is not a dock item. Store plugins are
  // reachable only through dock search, which installs and opens them.
  { id: "plugins", label: "Plugins", description: "Installed plugins", icon: "plugins", kind: "builtin" },
];

/**
 * Empty-query panel composition: open items, then unpinned tools (sliced to
 * the panel cap), hiding pinned non-open items that already sit in the dock
 * above. Pinned items reappear once the user types.
 */
export function visibleEmptyQuery(args: {
  docked: DockItem[];
  yours: DockItem[];
  openIds: string[];
  reserved?: number;
}): { open: DockItem[]; yours: DockItem[] } {
  const openSet = new Set(args.openIds);
  return sliceEmptyQueryRows({
    open: args.docked.filter((item) => openSet.has(item.id)),
    yours: args.yours,
    reserved: args.reserved,
  });
}
