import { db } from "../workspace/db";
import { recordAudit, type AuditActor } from "./audit";
import { withIdempotency } from "./idempotency";

export interface ArtifactRecord {
  id: string;
  workspaceId: string;
  sessionId?: string;
  name: string;
  type: string;
  path?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateArtifactInput {
  workspaceId: string;
  sessionId?: string;
  name: string;
  type?: string;
  path?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  id?: string;
  actor?: AuditActor;
  idempotencyKey?: string;
}

// Ensure table exists on startup
db.exec(`
  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    session_id TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    path TEXT,
    content TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_artifacts_workspace_id ON artifacts(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_artifacts_session_id ON artifacts(session_id);
`);

export class ArtifactService {
  public static async createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
    return await withIdempotency(
      input.idempotencyKey,
      "artifact.create",
      input.id || input.name,
      async () => {
        const id = input.id || `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();
        const type = input.type || "document";
        const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

        db.prepare(`
          INSERT INTO artifacts (id, workspace_id, session_id, name, type, path, content, metadata_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          input.workspaceId,
          input.sessionId || null,
          input.name,
          type,
          input.path || null,
          input.content || null,
          metadataJson,
          now,
          now
        );

        recordAudit({
          actor: input.actor || "user",
          action: "artifact.create",
          targetId: id,
          details: { name: input.name, workspaceId: input.workspaceId, type },
        });

        return {
          id,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          name: input.name,
          type,
          path: input.path,
          content: input.content,
          metadata: input.metadata,
          createdAt: now,
          updatedAt: now,
        };
      }
    );
  }

  public static listArtifacts(workspaceId: string, sessionId?: string): ArtifactRecord[] {
    let query = "SELECT * FROM artifacts WHERE workspace_id = ?";
    const params: any[] = [workspaceId];

    if (sessionId) {
      query += " AND session_id = ?";
      params.push(sessionId);
    }

    query += " ORDER BY created_at DESC";

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      sessionId: r.session_id || undefined,
      name: r.name,
      type: r.type,
      path: r.path || undefined,
      content: r.content || undefined,
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public static getArtifact(id: string): ArtifactRecord | null {
    const r = db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as any;
    if (!r) return null;

    return {
      id: r.id,
      workspaceId: r.workspace_id,
      sessionId: r.session_id || undefined,
      name: r.name,
      type: r.type,
      path: r.path || undefined,
      content: r.content || undefined,
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  public static deleteArtifact(
    id: string,
    actor: AuditActor = "user"
  ): { success: boolean; error?: string } {
    const existing = this.getArtifact(id);
    if (!existing) {
      return { success: false, error: "Artifact not found" };
    }

    db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);

    recordAudit({
      actor,
      action: "artifact.delete",
      targetId: id,
      details: { name: existing.name, workspaceId: existing.workspaceId },
    });

    return { success: true };
  }
}
