/**
 * Meta Model API agent tool-calling loop (Phase 2 implementation).
 */
export interface AgentStepEvent {
  step: number;
  type: string;
  payload?: unknown;
}
