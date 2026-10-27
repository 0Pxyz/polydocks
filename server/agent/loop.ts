import { z } from "zod";
import { config } from "../config";
import { llm, MODEL_ID } from "./llm";
import type { AgentTool } from "./tools/types";

export interface AgentStepEvent {
  step: number;
  type:
    | "agent.start"
    | "tool.start"
    | "tool.done"
    | "tab.created"
    | "tray.open"
    | "tab.prime"
    | "agent.finish"
    | "error";
  payload?: Record<string, unknown>;
}

export type AgentEventCallback = (event: AgentStepEvent) => Promise<void> | void;

export interface AgentLoopOptions {
  prompt: string;
  cityId?: string;
  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  tools?: AgentTool[];
  onEvent?: AgentEventCallback;
  maxSteps?: number;
  llmClient?: typeof llm;
  modelId?: string;
  systemPrompt?: string;
}

export interface AgentLoopResult {
  status: "completed" | "max_steps_reached" | "error";
  text?: string;
  steps: number;
  error?: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are the Polymax Dock Agent, powered by Meta Muse Spark.
Polymax is an Agentic Dock workspace and knowledge game for mastery.
The Dock is the user's persistent control surface: Browser, Notes, Papers, Files, Terminal, and dynamically synthesized tools.
- When creating tools, synthesize self-contained HTML/CSS/JS micro-apps adhering to dark theme tokens (#0A0A0C, #C8FF57, Inter/Syne).
- In a city workspace, knowledge files live in workspace/<city>/ (notes, sources, feed.json).
- Pedagogical autonomy: Guide, question, and surface authoritative primary sources; never rob the user of learning.
- You operate deterministically through tool calling.`;

/**
 * Executes the Meta Model API tool-calling loop with SSE event streaming.
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    prompt,
    cityId,
    history = [],
    tools = [],
    onEvent = () => {},
    maxSteps = config.MAX_STEPS,
    llmClient = llm,
    modelId = MODEL_ID,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
  } = options;

  let currentStep = 0;

  try {
    await onEvent({
      step: 0,
      type: "agent.start",
      payload: { prompt, cityId, model: modelId },
    });

    // Build tool registry map and OpenAI-compatible tools definitions
    const toolMap = new Map<string, AgentTool>();
    const formattedTools = tools.map((tool) => {
      toolMap.set(tool.name, tool);
      return {
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.schema) as Record<string, unknown>,
        },
      };
    });

    // Initialize conversation messages
    const messages: any[] = [
      {
        role: "system",
        content: cityId
          ? `${systemPrompt}\nActive City Workspace: ${cityId}`
          : systemPrompt,
      },
      ...history,
      {
        role: "user",
        content: prompt,
      },
    ];

    const retryCounts = new Map<string, number>();

    while (currentStep < maxSteps) {
      currentStep++;

      const completionParams: any = {
        model: modelId,
        messages,
      };

      if (formattedTools.length > 0) {
        completionParams.tools = formattedTools;
        completionParams.tool_choice = "auto";
      }

      const response = await llmClient.chat.completions.create(completionParams);
      const choice = response.choices?.[0];

      if (!choice || !choice.message) {
        throw new Error("No response message returned from Meta Model API");
      }

      const assistantMessage = choice.message;
      const toolCalls = assistantMessage.tool_calls;

      // If no tool calls, the model provided its final textual answer
      if (!toolCalls || toolCalls.length === 0) {
        const finalText = assistantMessage.content || "";
        await onEvent({
          step: currentStep,
          type: "agent.finish",
          payload: { text: finalText, steps: currentStep },
        });

        return {
          status: "completed",
          text: finalText,
          steps: currentStep,
        };
      }

      // Append the full assistant message (mandatory per dev.meta.ai documentation)
      messages.push(assistantMessage);

      // Execute each tool call
      for (const call of toolCalls) {
        const toolName = call.function.name;
        const toolId = call.id;
        let rawArgs: Record<string, unknown> = {};

        try {
          rawArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          rawArgs = {};
        }

        await onEvent({
          step: currentStep,
          type: "tool.start",
          payload: {
            id: toolId,
            name: toolName,
            arguments: rawArgs,
          },
        });

        const registeredTool = toolMap.get(toolName);
        let toolOutput: unknown;

        if (!registeredTool) {
          toolOutput = { error: `Tool "${toolName}" is not registered in catalog.` };
        } else {
          // Validate arguments against strict Zod schema with auto-retry protocol
          const parsed = registeredTool.schema.safeParse(rawArgs);
          if (!parsed.success) {
            const currentRetries = retryCounts.get(toolName) || 0;
            if (currentRetries < 2) {
              retryCounts.set(toolName, currentRetries + 1);
              toolOutput = {
                error: "Invalid arguments conforming to schema",
                validationErrors: parsed.error.issues,
                hint: "Please retry with valid arguments conforming to tool schema.",
              };
            } else {
              toolOutput = {
                error: `Tool "${toolName}" failed validation after 2 retry attempts.`,
                validationErrors: parsed.error.issues,
              };
            }
          } else {
            try {
              toolOutput = await registeredTool.execute(parsed.data, {
                cityId,
                step: currentStep,
              });
            } catch (execErr: any) {
              toolOutput = {
                error: `Execution error in tool "${toolName}": ${execErr.message || String(execErr)}`,
              };
            }
          }
        }

        // Append role: tool message per call
        messages.push({
          role: "tool",
          tool_call_id: toolId,
          content: typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput),
        });

        await onEvent({
          step: currentStep,
          type: "tool.done",
          payload: {
            id: toolId,
            name: toolName,
            result: toolOutput,
          },
        });

        // Trigger reactive UI events when applicable
        if (toolName === "create_tab" && toolOutput && typeof toolOutput === "object") {
          await onEvent({
            step: currentStep,
            type: "tab.created",
            payload: toolOutput as Record<string, unknown>,
          });
        }

        if (toolName === "open_tab" && toolOutput && typeof toolOutput === "object") {
          await onEvent({
            step: currentStep,
            type: "tray.open",
            payload: toolOutput as Record<string, unknown>,
          });
        }
      }
    }

    // Reached maximum steps
    await onEvent({
      step: currentStep,
      type: "agent.finish",
      payload: {
        text: `Reached maximum limit of ${maxSteps} steps.`,
        steps: currentStep,
      },
    });

    return {
      status: "max_steps_reached",
      text: `Reached maximum limit of ${maxSteps} steps.`,
      steps: currentStep,
    };
  } catch (err: any) {
    const errorMessage = err?.message || String(err);
    await onEvent({
      step: currentStep,
      type: "error",
      payload: { message: errorMessage },
    });

    return {
      status: "error",
      error: errorMessage,
      steps: currentStep,
    };
  }
}
