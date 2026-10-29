import { db } from "./db";

/**
 * Storage for the single persistent agent thread.
 *
 * Every user has exactly one thread. The transcript is append-only and the
 * model only ever receives a bounded window of recent turns plus a rolling
 * summary of everything older. There is no conversation list, no per-city
 * fork: context follows the user, not the current workspace view.
 */

export const THREAD_CONTEXT_MAX_MESSAGES = 24;
export const THREAD_CONTEXT_TOKEN_BUDGET = 6000;
export const THREAD_SUMMARY_THRESHOLD = 48;
export const THREAD_SUMMARY_KEEP_RECENT = 16;

const MAX_PERSISTED_DATA_URL_CHARS = 800_000;
const MAX_PERSISTED_TEXT_CHARS = 8_000;
const MAX_SNAPSHOT_MESSAGES = 200;

export type AgentThreadRole = "user" | "assistant" | "system";

export interface AgentThreadAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  isImage: boolean;
  dataUrl?: string;
  textContent?: string;
}

export interface AgentThread {
  id: string;
  userId: string;
  summary: string | null;
  summaryThroughSeq: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentThreadMessage {
  id: string;
  seq: number;
  threadId: string;
  role: AgentThreadRole;
  content: string;
  cityId?: string;
  attachments?: AgentThreadAttachment[];
  createdAt: string;
}

export interface ThreadPage {
  messages: AgentThreadMessage[];
  hasMore: boolean;
  nextBefore: number | null;
}

export interface ThreadContext {
  summary: string;
  messages: AgentThreadMessage[];
  /** Turns still covered by raw messages (not folded into the summary). */
  pendingMessages: number;
  /** Every stored turn, including summarized ones. */
  totalMessages: number;
}

interface ThreadRow {
  id: string;
  user_id: string;
  summary: string | null;
  summary_through_seq: number;
  created_at: string;
  updated_at: string;
}

interface ThreadMessageRow {
  seq: number;
  id: string;
  thread_id: string;
  role: string;
  content: string;
  city_id: string | null;
  attachments_json: string | null;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function threadRowToRecord(row: ThreadRow): AgentThread {
  return {
    id: row.id,
    userId: row.user_id,
    summary: row.summary,
    summaryThroughSeq: row.summary_through_seq,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapThreadMessage(row: ThreadMessageRow): AgentThreadMessage {
  let attachments: AgentThreadAttachment[] | undefined;
  if (row.attachments_json) {
    try {
      const parsed = JSON.parse(row.attachments_json);
      if (Array.isArray(parsed)) attachments = parsed as AgentThreadAttachment[];
    } catch {
      attachments = undefined;
    }
  }

  return {
    id: row.id,
    seq: row.seq,
    threadId: row.thread_id,
    role: row.role as AgentThreadRole,
    content: row.content,
    cityId: row.city_id || undefined,
    attachments,
    createdAt: row.created_at,
  };
}

/**
 * Persists attachment metadata for transcript hydration. Full data URLs and
 * extracted text are capped so a single upload cannot bloat the database.
 */
export function serializeThreadAttachments(
  attachments?: AgentThreadAttachment[]
): string | null {
  if (!attachments || attachments.length === 0) return null;

  const compact = attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    isImage: attachment.isImage,
    ...(attachment.dataUrl && attachment.dataUrl.length <= MAX_PERSISTED_DATA_URL_CHARS
      ? { dataUrl: attachment.dataUrl }
      : {}),
    ...(attachment.textContent
      ? { textContent: attachment.textContent.slice(0, MAX_PERSISTED_TEXT_CHARS) }
      : {}),
  }));

  return JSON.stringify(compact);
}

function ensureThread(userId: string): AgentThread {
  const timestamp = nowIso();
  const id = `thread_${userId}`;

  db.query(
    `INSERT OR IGNORE INTO agent_threads (id, user_id, title, summary, summary_through_seq, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, 0, ?, ?)`
  ).run(id, userId, timestamp, timestamp);

  const row = db
    .query<ThreadRow, [string]>("SELECT * FROM agent_threads WHERE user_id = ?")
    .get(userId);

  if (!row) {
    throw new Error(`Unable to initialize agent thread for user "${userId}"`);
  }

  return threadRowToRecord(row);
}

/**
 * Returns the user's single thread, creating it lazily on first use.
 */
export function getAgentThread(userId: string): AgentThread {
  return ensureThread(userId);
}

/**
 * Appends one turn to the user's thread and returns the stored record.
 */
export function appendThreadMessage(
  userId: string,
  role: AgentThreadRole,
  content: string,
  options?: {
    cityId?: string;
    attachments?: AgentThreadAttachment[];
  }
): AgentThreadMessage {
  const thread = ensureThread(userId);
  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = nowIso();

  db.query(
    `INSERT INTO agent_thread_messages (id, thread_id, role, content, city_id, attachments_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    thread.id,
    role,
    content,
    options?.cityId || null,
    serializeThreadAttachments(options?.attachments),
    createdAt
  );

  const inserted = db
    .query<{ seq: number }, []>("SELECT last_insert_rowid() AS seq")
    .get();

  db.query("UPDATE agent_threads SET updated_at = ? WHERE id = ?").run(createdAt, thread.id);

  return {
    id,
    seq: Number(inserted?.seq || 0),
    threadId: thread.id,
    role,
    content,
    cityId: options?.cityId,
    attachments: options?.attachments,
    createdAt,
  };
}

function pageThreadMessages(
  threadId: string,
  options?: { limit?: number; beforeSeq?: number }
): ThreadPage {
  const limit = Math.min(Math.max(Math.trunc(options?.limit ?? 40), 1), MAX_SNAPSHOT_MESSAGES);
  const beforeSeq = options?.beforeSeq;

  const rows =
    typeof beforeSeq === "number" && Number.isFinite(beforeSeq)
      ? db
          .query<ThreadMessageRow, [string, number, number]>(
            `SELECT * FROM agent_thread_messages
             WHERE thread_id = ? AND seq < ?
             ORDER BY seq DESC
             LIMIT ?`
          )
          .all(threadId, beforeSeq, limit + 1)
      : db
          .query<ThreadMessageRow, [string, number]>(
            `SELECT * FROM agent_thread_messages
             WHERE thread_id = ?
             ORDER BY seq DESC
             LIMIT ?`
          )
          .all(threadId, limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = (hasMore ? rows.slice(0, limit) : rows).reverse();
  const messages = pageRows.map(mapThreadMessage);

  return {
    messages,
    hasMore,
    nextBefore: messages.length > 0 ? messages[0].seq : null,
  };
}

/**
 * Latest page of the thread, oldest first. Used to hydrate the UI on load.
 */
export function getAgentThreadSnapshot(
  userId: string,
  options?: { limit?: number }
): { thread: AgentThread; page: ThreadPage } {
  const thread = ensureThread(userId);
  return { thread, page: pageThreadMessages(thread.id, { limit: options?.limit }) };
}

/**
 * Older page for infinite scroll, strictly before the given sequence.
 */
export function getOlderThreadMessages(
  userId: string,
  options: { beforeSeq: number; limit?: number }
): ThreadPage {
  const thread = ensureThread(userId);
  return pageThreadMessages(thread.id, {
    limit: options.limit,
    beforeSeq: options.beforeSeq,
  });
}

/**
 * Rough, provider-agnostic token estimate. We only need a stable budget guard,
 * not an exact tokenizer.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Builds the bounded context for the next model call: rolling summary plus
 * the most recent turns that fit inside the message and token budgets.
 */
export function getThreadContext(
  userId: string,
  options?: { maxMessages?: number; tokenBudget?: number }
): ThreadContext {
  const thread = ensureThread(userId);
  const maxMessages = Math.max(1, options?.maxMessages ?? THREAD_CONTEXT_MAX_MESSAGES);
  const tokenBudget = Math.max(256, options?.tokenBudget ?? THREAD_CONTEXT_TOKEN_BUDGET);

  const rows = db
    .query<ThreadMessageRow, [string, number, number]>(
      `SELECT * FROM agent_thread_messages
       WHERE thread_id = ? AND seq > ?
       ORDER BY seq DESC
       LIMIT ?`
    )
    .all(thread.id, thread.summaryThroughSeq, maxMessages * 3);

  const selected: AgentThreadMessage[] = [];
  let usedTokens = 0;

  for (const row of rows) {
    if (selected.length >= maxMessages) break;

    const cost = estimateTokens(row.content) + 8;
    if (selected.length > 0 && usedTokens + cost > tokenBudget) break;

    selected.push(mapThreadMessage(row));
    usedTokens += cost;
  }

  selected.reverse();

  const counts = db
    .query<{ total: number; pending: number }, [string, number]>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN seq > ? THEN 1 ELSE 0 END) AS pending
       FROM agent_thread_messages
       WHERE thread_id = ?`
    )
    .get(thread.summaryThroughSeq, thread.id);

  return {
    summary: thread.summary || "",
    messages: selected,
    pendingMessages: Number(counts?.pending || 0),
    totalMessages: Number(counts?.total || 0),
  };
}

/**
 * Turns not yet folded into the rolling summary, oldest first.
 */
export function getUnsummarizedThreadMessages(
  userId: string,
  limit = 500
): AgentThreadMessage[] {
  const thread = ensureThread(userId);
  const bounded = Math.min(Math.max(Math.trunc(limit), 1), MAX_SNAPSHOT_MESSAGES * 5);

  const rows = db
    .query<ThreadMessageRow, [string, number, number]>(
      `SELECT * FROM agent_thread_messages
       WHERE thread_id = ? AND seq > ?
       ORDER BY seq ASC
       LIMIT ?`
    )
    .all(thread.id, thread.summaryThroughSeq, bounded);

  return rows.map(mapThreadMessage);
}

/**
 * Advances the summary cursor. Older turns remain stored for the UI transcript
 * but are no longer sent to the model. Returns false when the call is stale.
 */
export function applyThreadSummary(userId: string, summary: string, throughSeq: number): boolean {
  const thread = ensureThread(userId);
  if (throughSeq <= thread.summaryThroughSeq) return false;

  db.query(
    `UPDATE agent_threads
     SET summary = ?, summary_through_seq = ?, updated_at = ?
     WHERE id = ?`
  ).run(summary, throughSeq, nowIso(), thread.id);

  return true;
}

/**
 * Removes a single turn. Used to roll back a prompt whose model call failed,
 * so retrying does not duplicate the user's message in the transcript.
 */
export function deleteThreadMessage(userId: string, messageId: string): boolean {
  const thread = ensureThread(userId);
  const result = db
    .query("DELETE FROM agent_thread_messages WHERE id = ? AND thread_id = ?")
    .run(messageId, thread.id);
  return Number(result.changes) > 0;
}

/**
 * Rewinds the last completed turn (assistant + user) before a retry, keeping
 * exactly one copy of the prompt in the thread.
 */
export function rewindLastThreadTurn(userId: string): number {
  const thread = ensureThread(userId);
  const rows = db
    .query<{ id: string; role: string }, [string, number]>(
      `SELECT id, role FROM agent_thread_messages
       WHERE thread_id = ?
       ORDER BY seq DESC
       LIMIT ?`
    )
    .all(thread.id, 2);

  const toDelete: string[] = [];
  for (const row of rows) {
    if (toDelete.length === 0 && row.role === "assistant") {
      toDelete.push(row.id);
      continue;
    }
    if (row.role === "user") {
      toDelete.push(row.id);
    }
    break;
  }

  let removed = 0;
  for (const id of toDelete) {
    const result = db
      .query("DELETE FROM agent_thread_messages WHERE id = ? AND thread_id = ?")
      .run(id, thread.id);
    removed += Number(result.changes);
  }

  if (removed > 0) {
    db.query("UPDATE agent_threads SET updated_at = ? WHERE id = ?").run(nowIso(), thread.id);
  }

  return removed;
}

/**
 * Clears the transcript but keeps the same single thread (no new section is
 * created in the UI). Summary state is reset with it.
 */
export function clearAgentThread(userId: string): boolean {
  try {
    const thread = ensureThread(userId);
    db.query("DELETE FROM agent_thread_messages WHERE thread_id = ?").run(thread.id);
    db.query(
      `UPDATE agent_threads
       SET summary = NULL, summary_through_seq = 0, updated_at = ?
       WHERE id = ?`
    ).run(nowIso(), thread.id);
    return true;
  } catch {
    return false;
  }
}
