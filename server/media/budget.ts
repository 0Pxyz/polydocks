import { db } from "../workspace/db";
import { config } from "../config";

/**
 * Daily spend ledger for Muse Image generations (chat-requested images,
 * share cards). Requests beyond IMAGE_MAX_PER_DAY fail with
 * budget_exceeded instead of spending ($0.01/image).
 */

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS image_spend (
  day TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);
`;

function ensureTable(): void {
  try {
    db.exec(TABLE_SQL);
  } catch {
    // Non-fatal: the guard falls back to allow and the job logs it.
  }
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getImageSpend(day = todayKey()): number {
  try {
    ensureTable();
    const row = db.query("SELECT count FROM image_spend WHERE day = ?").get(day) as any;
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

export function imageBudget(): { max: number; used: number; remaining: number } {
  const max = config.IMAGE_MAX_PER_DAY;
  const used = getImageSpend();
  return { max, used, remaining: Math.max(0, max - used) };
}

/** Reserve one generation. False when the cap is hit (no spend). */
export function reserveImageSpend(): boolean {
  try {
    ensureTable();
    const day = todayKey();
    if (getImageSpend(day) >= config.IMAGE_MAX_PER_DAY) return false;
    db.query(
      `INSERT INTO image_spend (day, count) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET count = count + 1`
    ).run(day);
    return true;
  } catch {
    return false;
  }
}

export function refundImageSpend(): void {
  try {
    const day = todayKey();
    db.query("UPDATE image_spend SET count = MAX(0, count - 1) WHERE day = ?").run(day);
  } catch {
    // Non-fatal accounting.
  }
}
