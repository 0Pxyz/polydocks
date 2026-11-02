import { z } from "zod";
import { db } from "../workspace/db";
import { defineCapability } from "./contract";
import { pluginRegistry } from "./registry";

/**
 * Notes first-party plugin (contract-based).
 *
 * Freeform workspace-scoped notes: the agent's scratch memory with titles.
 * Mirrors the `sources` schema pattern (workspace_id column, ISO timestamps).
 * Complements `sources` (saved URLs) and agent memory (opaque recall) — plain
 * user text, listed and read back by id.
 */
export const NOTES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function ensureNotesSchema(): void {
  db.exec(NOTES_TABLE_SQL);
}

const NoteOutput = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

function rowToNote(row: any) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function registerNotesPlugin(): void {
  ensureNotesSchema();

  defineCapability({
    plugin: "notes",
    name: "add",
    title: "Add Note",
    description: "Saves a freeform note (title + body) to the workspace.",
    scope: "workspace",
    input: z.object({
      workspaceId: z.string().min(1),
      title: z.string().min(1).describe("Note title"),
      body: z.string().default("").describe("Note body (markdown)"),
    }),
    output: NoteOutput,
    emits: [],
    risk: "write",
    handler: async (input) => {
      const id = `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      db.query(
        "INSERT INTO notes (id, workspace_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, input.workspaceId, input.title, input.body ?? "", now, now);
      return {
        ok: true as const,
        id,
        data: { id, workspaceId: input.workspaceId, title: input.title, body: input.body ?? "", createdAt: now, updatedAt: now },
      };
    },
  });

  defineCapability({
    plugin: "notes",
    name: "list",
    title: "List Notes",
    description: "Lists note titles for a workspace (newest first).",
    scope: "workspace",
    input: z.object({
      workspaceId: z.string().min(1),
    }),
    emits: [],
    risk: "read",
    handler: async (input) => {
      const rows = db
        .query("SELECT id, workspace_id, title, created_at, updated_at FROM notes WHERE workspace_id = ? ORDER BY created_at DESC")
        .all(input.workspaceId) as any[];
      return { ok: true as const, data: { workspaceId: input.workspaceId, items: rows.map(rowToNote) } };
    },
  });

  defineCapability({
    plugin: "notes",
    name: "get",
    title: "Get Note",
    description: "Reads one note with its full body by id.",
    scope: "workspace",
    input: z.object({
      id: z.string().min(1).describe("Note id from notes.list"),
      workspaceId: z.string().optional(),
    }),
    output: NoteOutput,
    emits: [],
    risk: "read",
    handler: async (input, ctx) => {
      const row = db.query("SELECT * FROM notes WHERE id = ?").get(input.id) as any;
      const targetWorkspace = input.workspaceId || ctx.workspaceId;
      if (!row || (targetWorkspace && row.workspace_id !== targetWorkspace)) {
        return { ok: false as const, error: `Note "${input.id}" not found.`, retryable: false as const };
      }
      return { ok: true as const, id: row.id, data: rowToNote(row) };
    },
  });

  // Contract rows default to first-party; core membership is the trust flag.
  const existing = pluginRegistry.get("notes");
  if (existing) {
    pluginRegistry.install({
      ...existing.manifest,
      name: "Notes",
      description: "Freeform workspace notes as typed capabilities",
      icon: "NotebookPen",
      trust: "core",
    });
  }
}
