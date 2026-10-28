import { db } from "../workspace/db";

// Ensure table exists on startup
db.exec(`
  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    target_id TEXT,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);
`);

/**
 * Executes an operation with idempotency deduplication.
 * If idempotencyKey is provided and has already been executed, returns cached result.
 */
export async function withIdempotency<T>(
  key: string | undefined,
  action: string,
  targetId: string | undefined,
  fn: () => Promise<T> | T
): Promise<T> {
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    return await fn();
  }

  const cleanKey = key.trim();

  // Check if idempotency key already exists
  const existing = db
    .prepare("SELECT response_json FROM idempotency_keys WHERE key = ?")
    .get(cleanKey) as any;

  if (existing && existing.response_json) {
    try {
      return JSON.parse(existing.response_json) as T;
    } catch {
      // If parsing fails, fall through to re-execute
    }
  }

  const result = await fn();
  const now = new Date().toISOString();

  try {
    const serialized = JSON.stringify(result);
    db.prepare(`
      INSERT OR REPLACE INTO idempotency_keys (key, action, target_id, response_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(cleanKey, action, targetId || null, serialized, now);
  } catch (err: any) {
    console.error(`[Idempotency] Failed to cache idempotency key "${cleanKey}":`, err.message);
  }

  return result;
}
