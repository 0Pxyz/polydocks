import { db } from "./db";

/**
 * dock_items: the durable single source for dock state.
 * One row per dock item (plugin): { id, pluginId, contextId, state, order, panel }.
 * contextId is opaque (null = global); the core never interprets it.
 * Mirrors the client pure model (src/lib/dock/dockItems.ts): order is
 * assigned once and never recalculated.
 */

export type DockItemState = "closed" | "background" | "open" | "focused";

export interface DockItemRow {
  id: string;
  pluginId: string;
  contextId: string | null;
  state: DockItemState;
  order: number;
  panel: "left" | "right" | null;
  updatedAt: string;
}

export function ensureDockItems(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dock_items (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      context_id TEXT,
      state TEXT NOT NULL DEFAULT 'closed',
      item_order INTEGER NOT NULL DEFAULT 0,
      panel TEXT,
      updated_at TEXT NOT NULL
    );
  `);
}

function toRow(r: any): DockItemRow {
  return {
    id: r.id,
    pluginId: r.plugin_id,
    contextId: r.context_id ?? null,
    state: r.state as DockItemState,
    order: r.item_order ?? 0,
    panel: (r.panel as "left" | "right" | null) ?? null,
    updatedAt: r.updated_at,
  };
}

export function listDockItems(): DockItemRow[] {
  ensureDockItems();
  const rows = db.query("SELECT * FROM dock_items ORDER BY item_order ASC").all() as any[];
  return rows.map(toRow);
}

export function getDockItem(id: string): DockItemRow | null {
  ensureDockItems();
  const row = db.query("SELECT * FROM dock_items WHERE id = ?").get(id) as any;
  return row ? toRow(row) : null;
}

function nextOrder(): number {
  ensureDockItems();
  const row = db.query("SELECT COALESCE(MAX(item_order), 0) as m FROM dock_items").get() as any;
  return (row?.m ?? 0) + 1;
}

/** Register without disturbing order; existing ids keep their order. */
export function registerDockItem(id: string, pluginId?: string, contextId?: string | null): DockItemRow {
  ensureDockItems();
  const existing = getDockItem(id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const row: DockItemRow = {
    id,
    pluginId: pluginId ?? id,
    contextId: contextId ?? null,
    state: "closed",
    order: nextOrder(),
    panel: null,
    updatedAt: now,
  };
  db.query(
    `INSERT INTO dock_items (id, plugin_id, context_id, state, item_order, panel, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(row.id, row.pluginId, row.contextId, row.state, row.order, row.panel, row.updatedAt);
  return row;
}

function saveRow(row: DockItemRow): DockItemRow {
  ensureDockItems();
  const now = new Date().toISOString();
  const next = { ...row, updatedAt: now };
  db.query(
    `INSERT INTO dock_items (id, plugin_id, context_id, state, item_order, panel, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET plugin_id=excluded.plugin_id, context_id=excluded.context_id,
       state=excluded.state, item_order=excluded.item_order, panel=excluded.panel, updated_at=excluded.updated_at`
  ).run(next.id, next.pluginId, next.contextId, next.state, next.order, next.panel, next.updatedAt);
  return next;
}

export function setDockState(id: string, state: DockItemState, panel: "left" | "right" | null = null): DockItemRow {
  const existing = registerDockItem(id);
  return saveRow({ ...existing, state, panel });
}

export function openDockItem(id: string, contextId?: string | null): DockItemRow {
  const existing = getDockItem(id);
  if (!existing) {
    const created = registerDockItem(id, id, contextId ?? null);
    return saveRow({ ...created, state: "focused", panel: "left" });
  }
  // Demote any other focused record to open (single focus).
  for (const row of listDockItems()) {
    if (row.state === "focused" && row.id !== id) saveRow({ ...row, state: "open" });
  }
  return saveRow({ ...existing, state: "focused", panel: "left" });
}

export function closeDockItem(id: string): DockItemRow | null {
  const existing = getDockItem(id);
  if (!existing) return null;
  return saveRow({ ...existing, state: "closed", panel: null });
}

export function backgroundDockItem(id: string): DockItemRow | null {
  const existing = getDockItem(id);
  if (!existing) return null;
  return saveRow({ ...existing, state: "background", panel: null });
}

export function visibleDockItems(activeContextId: string | null): DockItemRow[] {
  return listDockItems().filter(
    (r) =>
      (r.contextId === null || r.contextId === activeContextId) &&
      (r.state === "open" || r.state === "focused")
  );
}

/** Single action registry (server mirror of the client dockItems registry). */
export const DOCK_ACTIONS = [
  { id: "tabs.focus", description: "Focus the nth open item in the dock (visual order).", shortcut: "Ctrl+Shift+1…9", alternative: "Alt+1…9" },
  { id: "tabs.next", description: "Focus the next dock item.", shortcut: "Ctrl+Shift+→", alternative: "Alt+→" },
  { id: "tabs.prev", description: "Focus the previous dock item.", shortcut: "Ctrl+Shift+←", alternative: "Alt+←" },
  { id: "tabs.close", description: "Close the focused item. One click; state is kept.", shortcut: "Ctrl+Shift+W", alternative: "Alt+W" },
  { id: "tabs.background", description: "Move the focused item to background (keeps running).", shortcut: "Ctrl+Shift+H", alternative: "Alt+H" },
  { id: "chat.toggle", description: "Focus or toggle the chat panel.", shortcut: "Ctrl+Shift+0", alternative: "Alt+0" },
] as const;
