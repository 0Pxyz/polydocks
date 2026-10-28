import { db } from "./db";

export interface ConversationMessage {
  id: string;
  conversationId: string;
  cityId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: any[];
  toolCallId?: string;
  createdAt: string;
}

export interface CityConversationRecord {
  id: string;
  cityId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ensures a conversation record exists for the given city and returns it.
 */
export function getOrCreateCityConversation(cityId: string, title?: string): CityConversationRecord {
  const existing = db
    .query<
      {
        id: string;
        city_id: string;
        title: string | null;
        created_at: string;
        updated_at: string;
      },
      [string]
    >("SELECT * FROM city_conversations WHERE city_id = ?")
    .get(cityId);

  if (existing) {
    return {
      id: existing.id,
      cityId: existing.city_id,
      title: existing.title,
      createdAt: existing.created_at,
      updatedAt: existing.updated_at,
    };
  }

  const id = `conv_${cityId}_${Date.now()}`;
  const now = new Date().toISOString();

  db.query(
    `INSERT INTO city_conversations (id, city_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, cityId, title || null, now, now);

  return {
    id,
    cityId,
    title: title || null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Retrieve messages for a city's conversation.
 */
export function getCityConversationMessages(
  cityId: string,
  limit = 50
): ConversationMessage[] {
  try {
    const rows = db
      .query<
        {
          id: string;
          conversation_id: string;
          city_id: string;
          role: string;
          content: string;
          tool_calls_json: string | null;
          tool_call_id: string | null;
          created_at: string;
        },
        [string, number]
      >(
        `SELECT * FROM conversation_messages 
         WHERE city_id = ? 
         ORDER BY created_at ASC 
         LIMIT ?`
      )
      .all(cityId, limit);

    return rows.map((r) => {
      let toolCalls: any[] | undefined = undefined;
      if (r.tool_calls_json) {
        try {
          toolCalls = JSON.parse(r.tool_calls_json);
        } catch {
          toolCalls = undefined;
        }
      }

      return {
        id: r.id,
        conversationId: r.conversation_id,
        cityId: r.city_id,
        role: r.role as ConversationMessage["role"],
        content: r.content,
        toolCalls,
        toolCallId: r.tool_call_id || undefined,
        createdAt: r.created_at,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Append a message to the city's persistent conversation log.
 */
export function appendCityMessage(
  cityId: string,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  options?: {
    toolCalls?: any[];
    toolCallId?: string;
  }
): ConversationMessage {
  const conv = getOrCreateCityConversation(cityId);
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const toolCallsJson = options?.toolCalls ? JSON.stringify(options.toolCalls) : null;

  db.query(
    `INSERT INTO conversation_messages (id, conversation_id, city_id, role, content, tool_calls_json, tool_call_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    msgId,
    conv.id,
    cityId,
    role,
    content,
    toolCallsJson,
    options?.toolCallId || null,
    now
  );

  db.query(
    "UPDATE city_conversations SET updated_at = ? WHERE id = ?"
  ).run(now, conv.id);

  return {
    id: msgId,
    conversationId: conv.id,
    cityId,
    role,
    content,
    toolCalls: options?.toolCalls,
    toolCallId: options?.toolCallId,
    createdAt: now,
  };
}

/**
 * Clear conversation history for a city.
 */
export function clearCityConversation(cityId: string): boolean {
  try {
    db.query("DELETE FROM conversation_messages WHERE city_id = ?").run(cityId);
    db.query("DELETE FROM city_conversations WHERE city_id = ?").run(cityId);
    return true;
  } catch {
    return false;
  }
}
