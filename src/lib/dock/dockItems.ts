/**
 * dock_items: the single source of truth for dock state.
 *
 * Every dock entry is one record:
 *   { id, pluginId, contextId, state, order, panel }
 *
 * - contextId is opaque (null = global). The core never interprets it;
 *   a plugin passes its workspace id when opening.
 * - state: closed | background | open | focused
 *   - background keeps running (video, agent stream) without occupying space.
 *   - open is visible in a panel. focused is the panel receiving keyboard.
 * - order is assigned once on registration and never recalculated, so
 *   rehydration and view switches never reshuffle the bar.
 *
 * Filtering rule: visible = global (contextId null) + active context,
 * with state open/focused. Items from another context persist but hide.
 * There is never a visible-but-unopenable item: every visible id must be
 * mountable by the host.
 */

export type DockItemState = "closed" | "background" | "open" | "focused";

export interface DockItemRecord {
  id: string;
  pluginId: string;
  /** Opaque scope passed by the opener; null = global. */
  contextId: string | null;
  state: DockItemState;
  /** Stable insertion order. Assigned once, never recomputed. */
  order: number;
  /** Panel slot; null when not visible. */
  panel: "left" | "right" | null;
  updatedAt: number;
}

export interface DockItemsSnapshot {
  items: Record<string, DockItemRecord>;
  /** Stable visual order (registration order). Never re-sorted by recency. */
  order: string[];
  focusedId: string | null;
  activeContextId: string | null;
  /** Per-context focus memory so returning to a context restores the same focus. */
  focusedByContext: Record<string, string | null>;
  seq: number;
}

export function emptyDock(): DockItemsSnapshot {
  return { items: {}, order: [], focusedId: null, activeContextId: null, focusedByContext: {}, seq: 0 };
}

function contextKey(contextId: string | null): string {
  return contextId ?? "__global__";
}

export function isVisibleIn(
  record: DockItemRecord,
  activeContextId: string | null
): boolean {
  const inScope = record.contextId === null || record.contextId === activeContextId;
  return inScope && (record.state === "open" || record.state === "focused");
}

export function visibleIds(snapshot: DockItemsSnapshot): string[] {
  return snapshot.order.filter((id) => {
    const record = snapshot.items[id];
    return record ? isVisibleIn(record, snapshot.activeContextId) : false;
  });
}

/** Register without disturbing order. New ids append; existing ids keep order. */
export function registerItem(
  snapshot: DockItemsSnapshot,
  args: { id: string; pluginId?: string; contextId?: string | null }
): DockItemsSnapshot {
  const id = args.id.trim();
  if (!id) return snapshot;
  const existing = snapshot.items[id];
  if (existing) return snapshot;
  const seq = snapshot.seq + 1;
  const record: DockItemRecord = {
    id,
    pluginId: args.pluginId ?? id,
    contextId: args.contextId ?? null,
    state: "closed",
    order: seq,
    panel: null,
    updatedAt: Date.now(),
  };
  return {
    ...snapshot,
    items: { ...snapshot.items, [id]: record },
    order: [...snapshot.order, id],
    seq,
  };
}

function withFocus(snapshot: DockItemsSnapshot, focusedId: string | null): DockItemsSnapshot {
  const items: Record<string, DockItemRecord> = { ...snapshot.items };
  for (const [id, record] of Object.entries(items)) {
    if (record.state === "focused" && id !== focusedId) {
      items[id] = { ...record, state: "open", panel: record.panel ?? "left", updatedAt: Date.now() };
    }
  }
  if (focusedId && items[focusedId]) {
    const current = items[focusedId];
    if (current.state === "background" || current.state === "closed") {
      items[focusedId] = { ...current, state: "focused", panel: "left", updatedAt: Date.now() };
    } else {
      items[focusedId] = { ...current, state: "focused", updatedAt: Date.now() };
    }
  }
  const key = contextKey(snapshot.activeContextId);
  return {
    ...snapshot,
    items,
    focusedId,
    focusedByContext: { ...snapshot.focusedByContext, [key]: focusedId },
  };
}

/** Open (and focus). One click: the item becomes visible and focused. */
export function openItem(
  snapshot: DockItemsSnapshot,
  id: string,
  contextId?: string | null
): DockItemsSnapshot {
  let next = registerItem(snapshot, {
    id,
    contextId: contextId === undefined ? snapshot.activeContextId : contextId,
  });
  const record = next.items[id];
  // Adopt the opener context when the record was global but opened in a scope.
  // Records never migrate between contexts once scoped: that would leak a
  // other-context item into the bar (symptom 2).
  if (record.contextId === null && contextId !== undefined && contextId !== null) {
    // Keep global builtins global; scope only unknown ids opened from a workspace.
    // The caller decides: pass contextId only for workspace-scoped plugins.
  }
  const items = {
    ...next.items,
    [id]: { ...next.items[id], state: "focused" as DockItemState, panel: "left" as const, updatedAt: Date.now() },
  };
  next = { ...next, items };
  return withFocus(next, id);
}

/** Close: one click always hides. State persists; nothing is deleted. */
export function closeItem(snapshot: DockItemsSnapshot, id: string): DockItemsSnapshot {
  const record = snapshot.items[id];
  if (!record) return snapshot;
  if (record.state === "closed") return snapshot;
  const items = {
    ...snapshot.items,
    [id]: { ...record, state: "closed" as DockItemState, panel: null, updatedAt: Date.now() },
  };
  let next: DockItemsSnapshot = { ...snapshot, items };
  if (snapshot.focusedId === id) {
    // Focus the most recently updated visible item, else nothing.
    const fallback =
      [...next.order]
        .reverse()
        .map((candidate) => next.items[candidate])
        .find((candidate) => candidate && candidate.id !== id && isVisibleIn(candidate, next.activeContextId))?.id ??
      null;
    next = withFocus(next, fallback);
  }
  return next;
}

/** Focus an item in background: bring it forward, never remount. */
export function focusItem(snapshot: DockItemsSnapshot, id: string): DockItemsSnapshot {
  const record = snapshot.items[id];
  if (!record) return snapshot;
  if (!isVisibleIn(record, snapshot.activeContextId) && record.state !== "background") {
    // Closed items open on focus (single click); other-context items never focus.
    if (record.contextId !== null && record.contextId !== snapshot.activeContextId) return snapshot;
  }
  if (record.contextId !== null && record.contextId !== snapshot.activeContextId) return snapshot;
  const items = {
    ...snapshot.items,
    [id]: { ...record, state: "focused" as DockItemState, panel: "left" as const, updatedAt: Date.now() },
  };
  return withFocus({ ...snapshot, items }, id);
}

export function focusByIndex(snapshot: DockItemsSnapshot, index: number): DockItemsSnapshot {
  const visible = visibleIds(snapshot);
  const id = visible[index];
  if (!id) return snapshot;
  return focusItem(snapshot, id);
}

export function focusNext(snapshot: DockItemsSnapshot, direction: 1 | -1 = 1): DockItemsSnapshot {
  const visible = visibleIds(snapshot);
  if (visible.length === 0) return snapshot;
  const current = snapshot.focusedId ? visible.indexOf(snapshot.focusedId) : -1;
  const nextIndex = current < 0 ? 0 : (current + direction + visible.length) % visible.length;
  return focusItem(snapshot, visible[nextIndex]);
}

/** Move the focused item to background: keeps running, frees its panel. */
export function backgroundItem(snapshot: DockItemsSnapshot, id?: string): DockItemsSnapshot {
  const targetId = id ?? snapshot.focusedId;
  if (!targetId) return snapshot;
  const record = snapshot.items[targetId];
  if (!record) return snapshot;
  const items = {
    ...snapshot.items,
    [targetId]: { ...record, state: "background" as DockItemState, panel: null, updatedAt: Date.now() },
  };
  let next: DockItemsSnapshot = { ...snapshot, items };
  if (snapshot.focusedId === targetId) {
    const fallback =
      [...next.order]
        .reverse()
        .map((candidate) => next.items[candidate])
        .find((candidate) => candidate && candidate.id !== targetId && isVisibleIn(candidate, next.activeContextId))?.id ??
      null;
    next = withFocus(next, fallback);
  }
  return next;
}

/**
 * Switch the active context (opaque to the core). All records persist;
 * only visibility changes. Focus is remembered per context so returning
 * to a context restores the same focused item with no reorder.
 */
export function setActiveContext(
  snapshot: DockItemsSnapshot,
  contextId: string | null
): DockItemsSnapshot {
  if (snapshot.activeContextId === contextId) return snapshot;
  const currentKey = contextKey(snapshot.activeContextId);
  const focusedByContext = { ...snapshot.focusedByContext, [currentKey]: snapshot.focusedId };
  let next: DockItemsSnapshot = { ...snapshot, activeContextId: contextId, focusedByContext };
  const remembered = focusedByContext[contextKey(contextId)] ?? null;
  const rememberedVisible =
    remembered && next.items[remembered] && isVisibleIn(next.items[remembered], contextId)
      ? remembered
      : null;
  if (rememberedVisible) {
    next = withFocus(next, rememberedVisible);
  } else {
    // No valid remembered focus: clear focus but keep every record.
    // withFocus(null) demotes any stale focused flag to open.
    next = withFocus(next, null);
    // Re-focus the remembered item only when it becomes visible again;
    // otherwise leave focus empty (nothing visible to focus).
  }
  return { ...next, focusedByContext };
}

// ---------------------------------------------------------------------------
// Single action registry: one place defines action, shortcut (event.code),
// and description. Humans (keyboard), REST (/api/dock/action), CLI and
// agent verbs all run through these ids.
// Shortcuts use event.code, never event.key (Shift+1 yields "!" and layouts
// differ). Mac: Cmd behaves as Ctrl (metaKey accepted as ctrl).
// Known conflicts: browsers reserve some Ctrl+Shift+<key> combos and the OS
// may grab others; Alt+1…9 is the documented fallback (same actions).
// ---------------------------------------------------------------------------

export interface DockShortcutSpec {
  code: string;
  ctrl: boolean;
  shift: boolean;
}

export interface DockActionDef {
  id: "tabs.focus" | "tabs.next" | "tabs.prev" | "tabs.close" | "tabs.background" | "chat.toggle" | "sidebar.beside";
  description: string;
  shortcut: DockShortcutSpec;
  /** Human label for tooltips (shortcut number only shows on hover/focus). */
  hint: string;
  alternative: string;
}

export const DOCK_ACTIONS: DockActionDef[] = [
  {
    id: "tabs.focus",
    description: "Focus the nth open item in the dock (visual order).",
    shortcut: { code: "Digit1", ctrl: true, shift: true },
    hint: "Ctrl+Shift+1…9",
    alternative: "Alt+1…9",
  },
  {
    id: "tabs.next",
    description: "Focus the next dock item.",
    shortcut: { code: "ArrowRight", ctrl: true, shift: true },
    hint: "Ctrl+Shift+→",
    alternative: "Alt+→",
  },
  {
    id: "tabs.prev",
    description: "Focus the previous dock item.",
    shortcut: { code: "ArrowLeft", ctrl: true, shift: true },
    hint: "Ctrl+Shift+←",
    alternative: "Alt+←",
  },
  {
    id: "tabs.close",
    description: "Close the focused item. One click; state is kept.",
    shortcut: { code: "KeyW", ctrl: true, shift: true },
    hint: "Ctrl+Shift+W",
    alternative: "Alt+W",
  },
  {
    id: "tabs.background",
    description: "Move the focused item to background (keeps running).",
    shortcut: { code: "KeyH", ctrl: true, shift: true },
    hint: "Ctrl+Shift+H",
    alternative: "Alt+H",
  },
  {
    id: "chat.toggle",
    description: "Focus or toggle the chat panel.",
    shortcut: { code: "Digit0", ctrl: true, shift: true },
    hint: "Ctrl+Shift+0",
    alternative: "Alt+0",
  },
  {
    id: "sidebar.beside",
    description: "Open the current tool beside the main view (toggle).",
    shortcut: { code: "KeyS", ctrl: true, shift: true },
    hint: "Ctrl+Shift+S",
    alternative: "Alt+S",
  },
];

/** Digit1…Digit9 map to tabs.focus index 0…8 (same action, nth slot). */
export function matchDockShortcut(event: {
  code: string;
  ctrlKey: boolean;
  metaKey?: boolean;
  shiftKey: boolean;
  altKey?: boolean;
}): { action: DockActionDef; index?: number } | null {
  const ctrl = event.ctrlKey || event.metaKey === true;
  if (!ctrl || !event.shiftKey) {
    // Alt fallback: Alt+Digit / Alt+Arrows / Alt+W,H,0 (no Ctrl+Shift needed).
    if (event.altKey && !ctrl && !event.shiftKey) {
      const digit = /^Digit([0-9])$/.exec(event.code);
      if (digit) {
        const n = Number(digit[1]);
        if (n === 0) return { action: DOCK_ACTIONS[5] };
        return { action: DOCK_ACTIONS[0], index: n - 1 };
      }
      if (event.code === "ArrowRight") return { action: DOCK_ACTIONS[1] };
      if (event.code === "ArrowLeft") return { action: DOCK_ACTIONS[2] };
      if (event.code === "KeyW") return { action: DOCK_ACTIONS[3] };
      if (event.code === "KeyH") return { action: DOCK_ACTIONS[4] };
      if (event.code === "KeyS") {
        const beside = DOCK_ACTIONS.find((action) => action.id === "sidebar.beside");
        if (beside) return { action: beside };
      }
    }
    return null;
  }
  if (/^Digit[1-9]$/.test(event.code)) {
    return { action: DOCK_ACTIONS[0], index: Number(event.code.slice(5)) - 1 };
  }
  const found = DOCK_ACTIONS.find(
    (action) => action.shortcut.code === event.code
  );
  if (!found) return null;
  if (found.id === "tabs.focus") return { action: found, index: 0 };
  return { action: found };
}

/** Two panels fit at or above this viewport width (px). */
export const TWO_PANEL_MIN_WIDTH = 1100;

/** Beside-panel width bounds (mirror the chat panel: same feel, same room). */
export const BESIDE_WIDTH_MIN = 340;
export const BESIDE_WIDTH_MAX = 560;
export const BESIDE_WIDTH_DEFAULT = 400;

export interface PanelLayout {
  /** Chat panel is docked to the side (its own open rule already applied). */
  chatSide: boolean;
  /** Beside panel is docked to the right (needs full width). */
  besideSide: boolean;
  /** Beside panel floats over the content (narrow viewport). */
  besideOverlay: boolean;
  /** Left margin the content area must reserve for the chat panel. */
  mainMarginLeft: number;
  /** Right margin the content area must reserve for the beside panel. */
  mainMarginRight: number;
}

/**
 * One layout rule for all three regions (content | beside | chat), applied
 * to both panels. The chat keeps its own open/close behavior; this only
 * positions. Docked order is fixed: chat left, content center, beside
 * right. Below the two-panel width the beside panel overlays under the
 * chat (lower z-order) so each stays independently closable with no space
 * fight. Pure: covered by tests/tool-sidebar.test.ts.
 */
export function panelLayout(args: {
  chatSideOpen: boolean;
  besideCount: number;
  viewportWidth: number;
  sideWidth: number;
  besideWidth: number;
}): PanelLayout {
  const wide = args.viewportWidth >= TWO_PANEL_MIN_WIDTH;
  const chatSide = args.chatSideOpen;
  const besideSide = args.besideCount > 0 && wide;
  const besideOverlay = args.besideCount > 0 && !wide;
  return {
    chatSide,
    besideSide,
    besideOverlay,
    mainMarginLeft: chatSide ? args.sideWidth : 0,
    mainMarginRight: besideSide ? args.besideWidth : 0,
  };
}

/**
 * Dock items allowed beside the main view. Built-in tool panels plus
 * workspace/session plugins passed in as dynamic ids. The browser stays
 * main-only: one remote Chromium session per key, a second live instance
 * would fork it. The agent has its own panel; the map its own surface.
 */
const BESIDE_STATIC_IDS = new Set(["settings", "theme", "plugins", "creations", "store"]);

export function isBesideEligible(id: string | null | undefined, dynamicIds: Iterable<string>): boolean {
  if (!id || id === "agent" || id === "maps") return false;
  if (BESIDE_STATIC_IDS.has(id)) return true;
  for (const dyn of dynamicIds) {
    if (dyn === id) return true;
  }
  return false;
}

/**
 * Panel assignment: focused + most recent open side by side when wide
 * enough; otherwise only the focused item occupies a panel and the rest
 * stay open in the model (never unmounted) with panel null except focused.
 * Pure: callers keep TabHost mounted for every open record.
 */
export function assignPanels(
  snapshot: DockItemsSnapshot,
  viewportWidth: number
): DockItemsSnapshot {
  const visible = visibleIds(snapshot);
  if (visible.length === 0) return snapshot;
  const focused = snapshot.focusedId && visible.includes(snapshot.focusedId) ? snapshot.focusedId : visible[0];
  const items = { ...snapshot.items };
  for (const id of snapshot.order) {
    const record = items[id];
    if (!record) continue;
    if (!visible.includes(id)) {
      if (record.state === "open" || record.state === "focused") {
        // Keep model state; panel clears when not in the visible pair.
      }
      continue;
    }
  }
  if (viewportWidth >= TWO_PANEL_MIN_WIDTH && visible.length >= 2) {
    // Pair: focused left, most recently updated other visible right.
    const others = visible.filter((id) => id !== focused);
    const right =
      [...others].sort((a, b) => (items[b]?.updatedAt ?? 0) - (items[a]?.updatedAt ?? 0))[0] ?? others[0];
    for (const id of visible) {
      const record = items[id];
      if (id === focused) items[id] = { ...record, state: "focused", panel: "left" };
      else if (id === right) items[id] = { ...record, state: record.state === "focused" ? "open" : record.state, panel: "right" };
      else items[id] = { ...record, panel: null };
    }
    return { ...snapshot, items, focusedId: focused };
  }
  for (const id of visible) {
    const record = items[id];
    items[id] =
      id === focused
        ? { ...record, state: "focused", panel: "left" }
        : { ...record, state: record.state === "focused" ? "open" : record.state, panel: null };
  }
  return { ...snapshot, items, focusedId: focused };
}

/** Serialize for the read-cache (localStorage). Source stays in memory + server. */
export function serializeDock(snapshot: DockItemsSnapshot): string {
  return JSON.stringify(snapshot);
}

export function deserializeDock(raw: string | null): DockItemsSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DockItemsSnapshot;
    if (!parsed || typeof parsed !== "object" || !parsed.items || !Array.isArray(parsed.order)) return null;
    return { ...emptyDock(), ...parsed };
  } catch {
    return null;
  }
}
