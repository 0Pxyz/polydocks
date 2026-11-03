import { db } from "../server/workspace/db";

/**
 * Per-suite database hygiene for isolation suites (Tarefa 1, item 5).
 *
 * bun test runs every file in one process against one SQLite file, so
 * "each suite uses its own database" is implemented as strict prefix
 * scoping: every isolation suite generates a unique RUN prefix, wipes
 * ALL of its rows (across every table that keys on workspace/user id)
 * before AND after itself, and never touches another suite's rows.
 * Wiping on both ends makes the suites pass in any order, in repeated
 * runs, and after interrupted runs that skipped afterAll cleanup.
 *
 * Usage: const RUN = `name-${Date.now()}`; beforeAll(() => wipeRunPrefix(RUN));
 * afterAll(() => wipeRunPrefix(RUN));
 */
export function wipeRunPrefix(run: string): void {
  const like = `${run}%`;
  // Children first (they key on derived session ids, not the RUN prefix):
  // remove event/transcript/child rows through their parent session,
  // then the workspace-keyed parents.
  try {
    db.query(
      `DELETE FROM job_events WHERE session_id IN (SELECT id FROM sessions WHERE workspace_id LIKE ?)`
    ).run(like);
  } catch { /* best-effort (see below) */ }
  try {
    db.query(
      `DELETE FROM session_transcripts WHERE session_id IN (SELECT id FROM sessions WHERE workspace_id LIKE ?)`
    ).run(like);
  } catch { /* best-effort (see below) */ }
  const byWorkspace: Array<{ table: string; column: string }> = [
    { table: "tasks", column: "workspace_id" },
    { table: "tasks", column: "session_id" },
    { table: "artifacts", column: "workspace_id" },
    { table: "workspace_members", column: "workspace_id" },
    { table: "workspaces", column: "id" },
    { table: "workspace_plugins", column: "workspace_id" },
    { table: "dock_pins", column: "workspace_id" },
    { table: "sessions", column: "workspace_id" },
    { table: "sources", column: "workspace_id" },
    { table: "notes", column: "workspace_id" },
    { table: "executions", column: "workspace_id" },
  ];
  for (const { table, column } of byWorkspace) {
    try {
      db.query(`DELETE FROM "${table}" WHERE "${column}" LIKE ?`).run(like);
    } catch {
      // Table may not exist on older schemas; prefix hygiene is best-effort.
    }
  }
  try {
    db.query(`DELETE FROM session WHERE userId IN (SELECT id FROM "user" WHERE email LIKE ?)`)
      .run(like);
    db.query(`DELETE FROM account WHERE userId IN (SELECT id FROM "user" WHERE email LIKE ?)`)
      .run(like);
    db.query(`DELETE FROM verification WHERE identifier LIKE ?`).run(`%${run}%`);
    db.query(`DELETE FROM "user" WHERE email LIKE ? OR id LIKE ?`).run(like, like);
  } catch {
    // Auth tables only exist after ensureAuthTables(); same best-effort rule.
  }
}
