import {
  createSession as createSess,
  getSession as getSess,
  listSessions as listSess,
  updateSessionStatus as updateSessStatus,
  appendSessionTranscript as appendSessTranscript,
  readSessionTranscript as readSessTranscript,
  type Session,
  type SessionStatus,
} from "../agent/taskRunner";
import { recordAudit, type AuditActor } from "./audit";
import { withIdempotency } from "./idempotency";

export interface CreateSessionInput {
  workspaceId: string;
  title?: string;
  metadata?: Record<string, unknown>;
  id?: string;
  actor?: AuditActor;
  idempotencyKey?: string;
}

export class SessionService {
  public static async createSession(input: CreateSessionInput): Promise<Session> {
    return await withIdempotency(
      input.idempotencyKey,
      "session.create",
      input.id || input.title,
      async () => {
        const session = createSess({
          workspaceId: input.workspaceId,
          title: input.title,
          metadata: input.metadata,
          id: input.id,
        });

        recordAudit({
          actor: input.actor || "user",
          action: "session.create",
          targetId: session.id,
          details: { workspaceId: session.workspaceId, title: session.title },
        });

        return session;
      }
    );
  }

  public static listSessions(workspaceId?: string): Session[] {
    return listSess(workspaceId);
  }

  public static getSession(sessionId: string, workspaceId?: string): Session | null {
    return getSess(sessionId, workspaceId);
  }

  public static archiveSession(
    sessionId: string,
    actor: AuditActor = "user"
  ): Session | null {
    const session = getSess(sessionId);
    if (!session) return null;

    updateSessStatus(sessionId, "archived");
    recordAudit({
      actor,
      action: "session.archive",
      targetId: sessionId,
      details: { workspaceId: session.workspaceId },
    });

    return getSess(sessionId);
  }

  public static updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
    actor: AuditActor = "user"
  ): Session | null {
    const session = getSess(sessionId);
    if (!session) return null;

    updateSessStatus(sessionId, status);
    recordAudit({
      actor,
      action: "session.update_status",
      targetId: sessionId,
      details: { status, workspaceId: session.workspaceId },
    });

    return getSess(sessionId);
  }

  public static async getTranscript(
    sessionId: string,
    options?: { offset?: number; limit?: number; rootDir?: string }
  ): Promise<Array<Record<string, unknown>>> {
    return await readSessTranscript(sessionId, options);
  }

  public static async appendTranscript(
    sessionId: string,
    entry: Record<string, unknown>,
    rootDir?: string
  ): Promise<void> {
    await appendSessTranscript(sessionId, entry, rootDir);
  }
}
