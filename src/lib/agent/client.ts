import { adaptBackendEvent, type UIEvent } from "./events";
import type { ChatAttachment } from "./attachments";

export interface SendAgentMessageOptions {
  prompt: string;
  cityId?: string;
  userId?: string;
  modelId?: string;
  attachments?: ChatAttachment[];
  origin?: "dock-add" | "chat";
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Ask the server to rewind the last completed turn before re-running it. */
  retry?: boolean;
  onEvent: (event: UIEvent) => void;
  signal?: AbortSignal;
}

/**
 * Communicates with the Polymax Agent Loop backend over SSE.
 */
export async function streamAgentLoop(
  options: SendAgentMessageOptions
): Promise<void> {
  const { prompt, cityId, userId, modelId, attachments, origin, history = [], retry = false, onEvent, signal } = options;

  let response: Response;
  try {
    response = await fetch("/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(userId ? { "X-Polymax-User": userId } : {}),
      },
      body: JSON.stringify({
        prompt,
        cityId,
        userId,
        modelId,
        attachments,
        origin,
        retry,
        history,
      }),
      signal,
    });
  } catch {
    if (signal?.aborted) return;
    onEvent({
      type: "agent.error",
      step: 0,
      message:
        "Couldn't connect to the agent. Check that the server is running.",
    });
    return;
  }

  if (!response.ok) {
    let errorDetail = `Server returned status ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.error) {
        errorDetail = errJson.error;
      }
    } catch {
      // Fallback to status text
    }
    onEvent({
      type: "agent.error",
      step: 0,
      message: errorDetail,
    });
    return;
  }

  if (!response.body) {
    onEvent({
      type: "agent.error",
      step: 0,
      message: "Streaming response body unavailable.",
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent = "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          currentEvent = "";
          continue;
        }

        if (trimmed.startsWith("event:")) {
          currentEvent = trimmed.slice(6).trim();
        } else if (trimmed.startsWith("data:")) {
          const rawData = trimmed.slice(5).trim();
          try {
            const parsed = JSON.parse(rawData);
            const uiEvent = adaptBackendEvent({
              type: currentEvent || parsed.type,
              step: parsed.step,
              payload: parsed.payload,
            });
            if (uiEvent) {
              onEvent(uiEvent);
            }
          } catch {
            // Ignore partial/malformed JSON
          }
        }
      }
    }
  } catch (readErr: any) {
    if (signal?.aborted) return;
    onEvent({
      type: "agent.error",
      step: 0,
      message: readErr?.message || "Stream interrupted.",
    });
  } finally {
    reader.releaseLock();
  }
}
