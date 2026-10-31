import { platformStorage } from "@/lib/platform/storage";
import type { ChatAttachment } from "./attachments";

/**
 * Client for the single persistent agent thread.
 *
 * One thread per user, no conversation list and no sections: the UI hydrates
 * the same transcript after a reload and only asks for older pages when the
 * user scrolls back. Context windowing happens on the server.
 */

const USER_ID_KEY = "polymax-agent-user-id";
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export interface ThreadMessageRecord {
  id: string;
  seq: number;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: ChatAttachment[];
  createdAt: string;
}

export interface AgentThreadRecord {
  id: string;
  userId: string;
  summary: string | null;
  summaryThroughSeq: number;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadSnapshot {
  thread: AgentThreadRecord;
  messages: ThreadMessageRecord[];
  hasMore: boolean;
  nextBefore: number | null;
}

export interface ThreadMessagePage {
  messages: ThreadMessageRecord[];
  hasMore: boolean;
  nextBefore: number | null;
}

function createUserId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2).padEnd(24, "0");

  return `u_${uuid.slice(0, 24)}`;
}

/**
 * Stable anonymous id for this browser. It scopes the agent thread only; all
 * filesystem and tool permissions keep their own server-side checks.
 */
export function getAgentUserId(): string {
  const stored = platformStorage.getItem<string>(USER_ID_KEY);
  if (typeof stored === "string" && USER_ID_PATTERN.test(stored)) {
    return stored;
  }

  const userId = createUserId();
  platformStorage.setItem(USER_ID_KEY, userId);
  return userId;
}

function userHeaders(): Record<string, string> {
  return { "X-Polymax-User": getAgentUserId() };
}

function normalizeMessage(message: ThreadMessageRecord): ThreadMessageRecord {
  return {
    ...message,
    attachments: message.attachments?.map((attachment) => ({
      ...attachment,
      dataUrl: attachment.dataUrl || "",
    })),
  };
}

export async function fetchAgentThread(limit = 60): Promise<ThreadSnapshot | null> {
  try {
    const response = await fetch(`/api/agent/thread?limit=${limit}`, {
      headers: userHeaders(),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as ThreadSnapshot;
    return {
      ...data,
      messages: (data.messages || []).map(normalizeMessage),
    };
  } catch {
    return null;
  }
}

export async function fetchOlderThreadMessages(
  before: number,
  limit = 40
): Promise<ThreadMessagePage | null> {
  try {
    const response = await fetch(
      `/api/agent/thread/messages?before=${encodeURIComponent(before)}&limit=${limit}`,
      { headers: userHeaders() }
    );
    if (!response.ok) return null;

    const data = (await response.json()) as ThreadMessagePage;
    return {
      ...data,
      messages: (data.messages || []).map(normalizeMessage),
    };
  } catch {
    return null;
  }
}

export async function clearAgentThread(): Promise<boolean> {
  try {
    const response = await fetch("/api/agent/thread", {
      method: "DELETE",
      headers: userHeaders(),
    });
    return response.ok;
  } catch {
    return false;
  }
}
