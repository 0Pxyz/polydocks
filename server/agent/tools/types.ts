import type { ZodType } from "zod";

export interface ToolExecutionContext {
  cityId?: string;
  workspaceId?: string;
  sessionId?: string;
  taskId?: string;
  step: number;
}

export interface AgentTool<T = any> {
  name: string;
  description: string;
  schema: ZodType<T>;
  execute: (args: T, ctx: ToolExecutionContext) => Promise<unknown>;
}

export interface ToolCallPayload {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
