import { getMigrations } from "better-auth/db/migration";
import { auth } from "./index";
import { db } from "../workspace/db";

/**
 * Explicit, reversible identity migration.
 *
 * - Better Auth tables (`user`, `session`, `account`, `verification`) are
 *   created through Better Auth's own migration planner for the installed
 *   version (better-auth 1.7.x): additive only, never alters or drops
 *   existing PolyDocks tables. Reversible by dropping those four tables.
 * - `workspace_members` is PolyDocks-owned (NOT a Better Auth org table):
 *   it binds a Better Auth user id to a workspace id with a role.
 *   Legacy workspaces have zero rows and stay device-local; new workspaces
 *   created by a signed-in user get an `owner` row. Reversible by dropping
 *   the table (workspaces fall back to device-local).
 * - Idempotent: safe to run on every boot and inside tests.
 */
export async function ensureAuthTables(): Promise<{
  created: string[];
  added: string[];
}> {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options as any);
  const created = toBeCreated.map((t) => t.table);
  const added = toBeAdded.map((t) => `${t.table}.${Object.keys(t.fields).join(",")}`);
  if (toBeCreated.length > 0 || toBeAdded.length > 0) {
    await runMigrations();
    console.log(
      `[PolyDocks Auth] Migration: created [${created.join(", ")}] added [${added.join(", ")}]`
    );
  }
  ensureMembershipTables();
  return { created, added };
}

export function ensureMembershipTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_members_user
      ON workspace_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace
      ON workspace_members(workspace_id);
  `);
}

export type WorkspaceRole = "owner" | "member";

export function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole = "owner"
): void {
  ensureMembershipTables();
  db.query(
    `INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(workspaceId, userId, role, new Date().toISOString());
}

export function getWorkspaceMember(
  workspaceId: string,
  userId: string
): { workspaceId: string; userId: string; role: string; createdAt: string } | null {
  ensureMembershipTables();
  const row = db
    .query<any, [string, string]>(
      `SELECT workspace_id, user_id, role, created_at FROM workspace_members
       WHERE workspace_id = ? AND user_id = ?`
    )
    .get(workspaceId, userId) as any;
  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

/** Number of members bound to a workspace. Zero = legacy device-local. */
export function countWorkspaceMembers(workspaceId: string): number {
  ensureMembershipTables();
  const row = db
    .query<any, [string]>(
      `SELECT COUNT(*) as n FROM workspace_members WHERE workspace_id = ?`
    )
    .get(workspaceId) as any;
  return Number(row?.n ?? 0);
}

export function listUserWorkspaceIds(userId: string): string[] {
  ensureMembershipTables();
  const rows = db
    .query<any, [string]>(
      `SELECT workspace_id FROM workspace_members WHERE user_id = ?`
    )
    .all(userId) as Array<{ workspace_id: string }>;
  return rows.map((r) => r.workspace_id);
}

/** Membership rows for the account panel (workspace membership section). */
export function listUserMemberships(userId: string): Array<{
  workspaceId: string;
  role: string;
  createdAt: string;
}> {
  ensureMembershipTables();
  const rows = db
    .query<any, [string]>(
      `SELECT workspace_id, role, created_at FROM workspace_members
       WHERE user_id = ? ORDER BY created_at ASC`
    )
    .all(userId) as Array<{ workspace_id: string; role: string; created_at: string }>;
  return rows.map((r) => ({
    workspaceId: r.workspace_id,
    role: r.role,
    createdAt: r.created_at,
  }));
}

export function removeWorkspaceMember(workspaceId: string, userId: string): boolean {
  ensureMembershipTables();
  const result = db
    .query(`DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?`)
    .run(workspaceId, userId);
  return result.changes > 0;
}

/** Removes every membership row for a workspace (workspace deletion). */
export function removeAllWorkspaceMembers(workspaceId: string): void {
  ensureMembershipTables();
  db.query(`DELETE FROM workspace_members WHERE workspace_id = ?`).run(workspaceId);
}
