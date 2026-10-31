import { db } from "../workspace/db";
import { redactSecrets } from "../plugins/redact";

export type AuditActor = "agent" | "user" | "cli";

export interface AuditRecord {
  id: number;
  workspaceId?: string;
  actor: AuditActor;
  action: string;
  targetId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface RecordAuditOptions {
  actor?: AuditActor;
  action: string;
  targetId?: string;
  workspaceId?: string;
  details?: Record<string, unknown> | unknown;
}

// Ensure columns exist on SQLite instance
try {
  db.exec("ALTER TABLE audit_log ADD COLUMN actor TEXT DEFAULT 'user';");
} catch {
  // column already exists
}
try {
  db.exec("ALTER TABLE audit_log ADD COLUMN target_id TEXT;");
} catch {
  // column already exists
}

function sanitizeAuditPayload(val: any): any {
  if (typeof val === "string") {
    let s = redactSecrets(val);
    s = s.replace(/(bearer\s+)[A-Za-z0-9_.-]{16,}/gi, "$1[REDACTED_SECRET]");
    s = s.replace(/(sk-[a-zA-Z0-9_-]{20,})/gi, "[REDACTED_SECRET]");
    s = s.replace(/(ghp_[a-zA-Z0-9]{36}|AIza[0-9A-Za-z-_]{35})/g, "[REDACTED_SECRET]");
    s = s.replace(
      /((?:api[_-]?key|secret|password|auth[_-]?token|access[_-]?token)["']?\s*[:=]\s*["']?)[A-Za-z0-9_.-]{8,}(["']?)/gi,
      "$1[REDACTED_SECRET]$2"
    );
    return s;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeAuditPayload);
  }
  if (typeof val === "object" && val !== null) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = sanitizeAuditPayload(v);
    }
    return res;
  }
  return val;
}

/**
 * Records an entry into the unified audit_log table with automatic secret redaction.
 */
export function recordAudit(options: RecordAuditOptions): void {
  const actor = options.actor || "user";
  const action = options.action;
  const targetId = options.targetId || null;
  const workspaceId = options.workspaceId || null;
  const now = new Date().toISOString();

  let detailsStr: string | null = null;
  if (options.details !== undefined && options.details !== null) {
    try {
      const sanitized = sanitizeAuditPayload(options.details);
      detailsStr = JSON.stringify(sanitized);
    } catch {
      detailsStr = JSON.stringify({ error: "Failed to serialize audit details" });
    }
  }

  try {
    db.prepare(`
      INSERT INTO audit_log (workspace_id, actor, action, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(workspaceId, actor, action, targetId, detailsStr, now);
  } catch (err: any) {
    console.error(`[AuditLog] Failed to record audit log for "${action}":`, err.message);
  }
}

/**
 * Retrieves audit log entries with optional filters.
 */
export function getAuditLogs(options?: {
  action?: string;
  targetId?: string;
  actor?: AuditActor;
  limit?: number;
}): AuditRecord[] {
  let query = "SELECT * FROM audit_log WHERE 1=1";
  const params: any[] = [];

  if (options?.action) {
    query += " AND action = ?";
    params.push(options.action);
  }
  if (options?.targetId) {
    query += " AND target_id = ?";
    params.push(options.targetId);
  }
  if (options?.actor) {
    query += " AND actor = ?";
    params.push(options.actor);
  }

  query += " ORDER BY id DESC";

  if (options?.limit) {
    query += " LIMIT ?";
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id || undefined,
    actor: (r.actor as AuditActor) || "user",
    action: r.action,
    targetId: r.target_id || undefined,
    details: r.details ? JSON.parse(r.details) : undefined,
    createdAt: r.created_at,
  }));
}
