import { db } from "../workspace/db";

export interface SandboxRecord {
  workspaceId: string;
  sandboxId: string;
  name: string;
  volume: string;
  status: string;
  previewUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/** Canonical owner of workspace↔sandbox identity. The sandbox itself and its
 *  volume are disposable compute; this row is only a pointer. Product data
 *  stays in workspace tables (see docs/persistence.md). */
export function ensureSandboxStore(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_sandboxes (
      workspace_id TEXT PRIMARY KEY,
      sandbox_id TEXT NOT NULL,
      name TEXT NOT NULL,
      volume TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      preview_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function getSandboxRecord(workspaceId: string): SandboxRecord | null {
  ensureSandboxStore();
  const r = db
    .query<any, [string]>(`SELECT * FROM workspace_sandboxes WHERE workspace_id = ?`)
    .get(workspaceId) as any;
  if (!r) return null;
  return {
    workspaceId: r.workspace_id,
    sandboxId: r.sandbox_id,
    name: r.name,
    volume: r.volume,
    status: r.status,
    previewUrl: r.preview_url || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function upsertSandboxRecord(input: {
  workspaceId: string;
  sandboxId: string;
  name: string;
  volume: string;
  status?: string;
  previewUrl?: string | null;
}): SandboxRecord {
  ensureSandboxStore();
  const now = new Date().toISOString();
  const existing = getSandboxRecord(input.workspaceId);
  if (existing) {
    db.query(
      `UPDATE workspace_sandboxes SET sandbox_id = ?, name = ?, volume = ?, status = ?, preview_url = ?, updated_at = ? WHERE workspace_id = ?`
    ).run(
      input.sandboxId,
      input.name,
      input.volume,
      input.status || existing.status,
      input.previewUrl !== undefined ? input.previewUrl : existing.previewUrl || null,
      now,
      input.workspaceId
    );
    return getSandboxRecord(input.workspaceId)!;
  }
  db.query(
    `INSERT INTO workspace_sandboxes (workspace_id, sandbox_id, name, volume, status, preview_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.workspaceId,
    input.sandboxId,
    input.name,
    input.volume,
    input.status || "running",
    input.previewUrl || null,
    now,
    now
  );
  return getSandboxRecord(input.workspaceId)!;
}

export function updateSandboxStatus(workspaceId: string, status: string, previewUrl?: string | null): void {
  ensureSandboxStore();
  if (previewUrl !== undefined) {
    db.query(`UPDATE workspace_sandboxes SET status = ?, preview_url = ?, updated_at = ? WHERE workspace_id = ?`).run(
      status,
      previewUrl,
      new Date().toISOString(),
      workspaceId
    );
  } else {
    db.query(`UPDATE workspace_sandboxes SET status = ?, updated_at = ? WHERE workspace_id = ?`).run(
      status,
      new Date().toISOString(),
      workspaceId
    );
  }
}

export function clearSandboxRecord(workspaceId: string): void {
  ensureSandboxStore();
  db.query(`DELETE FROM workspace_sandboxes WHERE workspace_id = ?`).run(workspaceId);
}

/** Workspace-scoped resource names: lowercase alnum + dashes, Modal-safe. */
export function sandboxNameFor(workspaceId: string): string {
  const slug = workspaceId.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `ws-${slug || "default"}`;
}

export function volumeNameFor(workspaceId: string): string {
  const slug = workspaceId.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `polydocks-ws-${slug || "default"}`;
}
