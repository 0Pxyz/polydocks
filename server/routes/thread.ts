import { Hono } from "hono";
import { effectiveUserId, getEffectiveCaller } from "../auth/session";
import { denyUnlessIdentified } from "../auth/guard";
import {
  clearAgentThread,
  getAgentThreadSnapshot,
  getOlderThreadMessages,
  type AgentThreadMessage,
} from "../workspace/thread";

export const threadRouter = new Hono();

function serializeMessage(message: AgentThreadMessage) {
  return {
    id: message.id,
    seq: message.seq,
    role: message.role,
    content: message.content,
    workspaceId: message.workspaceId,
    attachments: message.attachments,
    createdAt: message.createdAt,
  };
}

function parseLimit(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 200);
}

/**
 * GET /api/agent/thread
 * Latest page of the caller's single persistent conversation, oldest first.
 * Signed-in callers get their account thread (Better Auth id); local
 * callers keep the legacy device-local thread.
 */
threadRouter.get("/", async (c) => {
  const blocked = await denyUnlessIdentified(c);
  if (blocked) return blocked;
  const caller = await getEffectiveCaller(c.req.raw.headers);
  const userId = effectiveUserId(caller);
  const limit = parseLimit(c.req.query("limit"), 60);

  const { thread, page } = getAgentThreadSnapshot(userId, { limit });

  return c.json({
    thread: {
      id: thread.id,
      userId: thread.userId,
      summary: thread.summary,
      summaryThroughSeq: thread.summaryThroughSeq,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    },
    messages: page.messages.map(serializeMessage),
    hasMore: page.hasMore,
    nextBefore: page.nextBefore,
  });
});

/**
 * GET /api/agent/thread/messages?before=<seq>
 * Older page for scroll-back inside the same thread. Never creates a section.
 */
threadRouter.get("/messages", async (c) => {
  const blocked = await denyUnlessIdentified(c);
  if (blocked) return blocked;
  const caller = await getEffectiveCaller(c.req.raw.headers);
  const userId = effectiveUserId(caller);
  const before = Number.parseInt(c.req.query("before") || "", 10);
  if (!Number.isFinite(before) || before <= 0) {
    return c.json({ error: "Missing or invalid 'before' cursor" }, 400);
  }

  const limit = parseLimit(c.req.query("limit"), 40);
  const page = getOlderThreadMessages(userId, { beforeSeq: before, limit });

  return c.json({
    messages: page.messages.map(serializeMessage),
    hasMore: page.hasMore,
    nextBefore: page.nextBefore,
  });
});

/**
 * DELETE /api/agent/thread
 * Clears the transcript inside the same thread. No new thread is created.
 */
threadRouter.delete("/", async (c) => {
  const blocked = await denyUnlessIdentified(c);
  if (blocked) return blocked;
  const caller = await getEffectiveCaller(c.req.raw.headers);
  const userId = effectiveUserId(caller);

  const cleared = clearAgentThread(userId);
  return c.json({ success: cleared, userId });
});
