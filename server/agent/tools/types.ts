import type { ZodType } from "zod";

export interface ToolExecutionContext {
  workspaceId?: string;
  sessionId?: string;
  taskId?: string;
  step: number;
  /** Who is acting: the agent (chat/task/dock turns), the CLI, or a user-confirmed surface. Defaults to "user". */
  actor?: "agent" | "cli" | "user";
}

export interface AgentTool<T = any> {
  name: string;
  description: string;
  schema: ZodType<T>;
  execute: (args: T, ctx: ToolExecutionContext) => Promise<unknown>;
  /** Model role this tool needs. Plugins declare a role; the registry picks the provider. */
  modelRole?: import("../modelRegistry").ModelRole;
}

export interface ToolCallPayload {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
