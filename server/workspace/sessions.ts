import { db } from "./db";

/**
 * Canonical DDL owner for background sessions, tasks and their transcript
 * mirror. taskRunner.ts used to carry a duplicate copy of these statements;
 * it now calls ensureSessionTaskTables() instead, so there is exactly one
 * definition. schema.sql carries the same statements for fresh databases.
 *
 * Ownership (see docs/persistence.md):
 * - sessions/tasks rows: SQLite is the store (via SessionService/TaskService).
 * - Transcripts: agent-home/sessions/*.jsonl is the current store;
 *   session_transcripts is a crash-safe SQLite mirror written alongside
 *   every append (backfill). Reads stay on JSONL until the verification
 *   window completes; the mirror makes removal reversible.
 */
export function ensureSessionTaskTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id ON sessions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress REAL DEFAULT 0.0,
      input_json TEXT,
      output_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

    CREATE TABLE IF NOT EXISTS session_transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      entry_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_transcripts_session_id ON session_transcripts(session_id);
  `);
}

/**
 * Mirrors one transcript entry into SQLite. INSERT-only, never updates or
 * deletes: the JSONL file stays the read path while the mirror converges.
 */
export function mirrorTranscriptEntry(sessionId: string, entry: Record<string, unknown>): void {
  ensureSessionTaskTables();
  try {
    db.query(
      `INSERT INTO session_transcripts (session_id, entry_json, created_at) VALUES (?, ?, ?)`
    ).run(sessionId, JSON.stringify(entry), new Date().toISOString());
  } catch {
    // Non-blocking telemetry failure: JSONL remains the read path.
  }
}

/**
 * Reads mirrored transcript entries for a session (verification path only;
 * production reads stay on JSONL until the window completes).
 */
export function readMirroredTranscript(
  sessionId: string,
  options?: { offset?: number; limit?: number }
): Array<Record<string, unknown>> {
  ensureSessionTaskTables();
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = options?.limit !== undefined ? Math.max(1, options.limit) : -1;
  const rows = db
    .query<any, [string, number, number]>(
      `SELECT entry_json FROM session_transcripts WHERE session_id = ? ORDER BY id ASC LIMIT ? OFFSET ?`
    )
    .all(sessionId, limit, offset) as Array<{ entry_json: string }>;
  return rows.map((r) => JSON.parse(r.entry_json));
}
