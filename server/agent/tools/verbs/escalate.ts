import { z } from "zod";
import type { AgentTool } from "../../types";
import { getHeavyRunner } from "../../orchestrator";

/**
 * The orchestrator's only route to heavy work (#212). Plain function tool:
 * no tool search on the orchestrator surface (#211). Since tool_choice is
 * auto-only, escalation is enforced through this description, the
 * orchestrator prompt, and missed-escalation evals — never by the API.
 */
export const escalate: AgentTool<{
  prompt: string;
  intent?: string;
  workspaceId?: string;
  contextId?: string;
  historySummary?: string;
  maxSteps?: number;
}> = {
  name: "escalate",
  description:
    "Hand work needing created or edited code, multi-step reasoning, or tools outside dock verbs to the heavy agent. Use it whenever the request is more than opening, closing, listing, or pinning something that already exists. Returns the heavy agent's final answer — relay it, do not act on it yourself.",
  schema: z.object({
    prompt: z.string().min(1).describe("Full request for the heavy agent (self-contained: goal, constraints, workspace)"),
    intent: z.string().optional().describe("Classified intent, when already known"),
    workspaceId: z.string().optional().describe("Workspace the heavy agent acts in"),
    contextId: z.string().optional().describe("Opaque context id passed through untouched"),
    historySummary: z.string().optional().describe("Compressed prior conversation, when any"),
    maxSteps: z.number().int().min(1).max(50).optional().describe("Bound on heavy-agent steps"),
  }),
  execute: async (args) => {
    const result = await getHeavyRunner()({
      prompt: args.prompt,
      intent: args.intent,
      workspaceId: args.workspaceId,
      contextId: args.contextId,
      historySummary: args.historySummary,
      constraints: typeof args.maxSteps === "number" ? { maxSteps: args.maxSteps } : undefined,
    });
    if (!result.ok) {
      return { error: result.error ?? "heavy agent failed", steps: result.steps };
    }
    return { text: result.text, steps: result.steps, citations: result.citations };
  },
};
