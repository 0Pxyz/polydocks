import { z } from "zod";
import { config } from "../config";
import { llm, MODEL_ID } from "./llm";
import { defaultTools } from "./tools";
import type { AgentTool } from "./tools/types";
import { loadSkill, isTabSynthesisIntent, isResearchIntent, isWorldPlanningIntent } from "./skills";

export interface AgentStepEvent {
  step: number;
  type:
    | "agent.start"
    | "tool.start"
    | "tool.done"
    | "tab.created"
    | "tray.open"
    | "tab.prime"
    | "map.changed"
    | "map.point.added"
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
- World Map & Knowledge Territories: Polymax organizes learning into an explorable world map where regions are domains and cities are topics.
- When the user asks to create, explore, or master a new discipline or knowledge area (e.g., "criar nova area de conhecimento", "quero aprender sobre física quântica", "learn Neuroscience"):
  1. Use plan_map({ interests: [topic] }) to establish the region and progression cities on the world map.
  2. Use build_city({ cityId, topic, depth: "deep" }) to construct the workspace with primary sources, notes, and quests.
  3. Respond with an inspiring, structured pedagogical summary of the new territory and suggest which city to explore first. Avoid unnecessary repeated tool loops.
- Autonomous Web Research & Discovery (TinyFish): You have access to real-time search and web retrieval tools (search_web, fetch_page). Proactively search and fetch whenever you need authoritative primary sources, breakthrough papers, official documentation, or verified technical context.
- City Workspace Context: In a city workspace, knowledge files live in workspace/<city>/ (notes, sources, feed.json). Use research to populate living feeds (feed.json), write technical synthesis notes, and design mastery quests.
- When opening or directing tabs to study or work content, call open_intent to prime the tab (e.g., Browser with a tutorial/paper URL, Notes with a target markdown file, attaching active quest XP).
- Inspect active tab and workspace state at any time using inspect_tab.
- When creating tools, synthesize self-contained HTML/CSS/JS micro-apps adhering to dark theme tokens (#0A0A0C, #C8FF57, Inter/Syne).
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
    tools = defaultTools,
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

    // Context-aware dynamic skill injection
    let activeSystemPrompt = systemPrompt;

    if (isTabSynthesisIntent(prompt)) {
      try {
        const tabSkillPrompt = await loadSkill("create-tab");
        activeSystemPrompt = `${activeSystemPrompt}\n\n---\n## Specialized Skill: Dynamic Tab Synthesis\n${tabSkillPrompt}`;
      } catch {
        // Non-fatal
      }
    }

    if (isResearchIntent(prompt) || Boolean(cityId)) {
      try {
        const researchSkillPrompt = await loadSkill("web-research");
        activeSystemPrompt = `${activeSystemPrompt}\n\n---\n## Specialized Skill: Web Research & Primary Source Discovery (TinyFish)\n${researchSkillPrompt}`;
      } catch {
        // Non-fatal
      }
    }

    if (isWorldPlanningIntent(prompt)) {
      try {
        const worldSkillPrompt = await loadSkill("world-planning");
        activeSystemPrompt = `${activeSystemPrompt}\n\n---\n## Specialized Skill: Knowledge Territories & World Map Planning\n${worldSkillPrompt}`;
      } catch {
        // Non-fatal
      }
    }

    // Initialize conversation messages
    const messages: any[] = [
      {
        role: "system",
        content: cityId
          ? `${activeSystemPrompt}\nActive City Workspace: ${cityId}`
          : activeSystemPrompt,
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

        if ((toolName === "open_tab" || toolName === "open_intent") && toolOutput && typeof toolOutput === "object") {
          await onEvent({
            step: currentStep,
            type: "tray.open",
            payload: toolOutput as Record<string, unknown>,
          });
        }

        if (toolName === "open_intent" && toolOutput && typeof toolOutput === "object") {
          await onEvent({
            step: currentStep,
            type: "tab.prime",
            payload: toolOutput as Record<string, unknown>,
          });
        }

        if ((toolName === "set_map" || toolName === "plan_map") && toolOutput && typeof toolOutput === "object") {
          const spec = (toolOutput as any).spec;
          await onEvent({
            step: currentStep,
            type: "map.changed",
            payload: {
              mapId: spec?.id || (toolOutput as any).mapId || "world-map",
              name: spec?.title,
              spec,
              ...(toolOutput as Record<string, unknown>),
            },
          });
        }

        if (toolName === "place_city" && toolOutput && typeof toolOutput === "object") {
          await onEvent({
            step: currentStep,
            type: "map.point.added",
            payload: toolOutput as Record<string, unknown>,
          });
        }
      }
    }

    // Reached maximum steps — synthesize progress gracefully rather than failing abruptly
    let fallbackText = "";
    try {
      const fallbackMessages = [
        ...messages,
        {
          role: "user",
          content:
            "Please provide a helpful final synthesis summarizing what was accomplished (knowledge areas planned, cities constructed, notes or sources discovered) and what the user should explore next. Do not call any tools.",
        },
      ];

      const fallbackResponse = await llmClient.chat.completions.create({
        model: modelId,
        messages: fallbackMessages,
      });

      const fallbackChoice = fallbackResponse.choices?.[0];
      if (fallbackChoice?.message?.content) {
        fallbackText = fallbackChoice.message.content.trim();
      }
    } catch {
      // Non-fatal
    }

    if (!fallbackText) {
      fallbackText =
        "I've structured your knowledge territory and prepared the workspace. You can explore the cities on the map or ask me to dive into any specific concept.";
    }

    await onEvent({
      step: currentStep,
      type: "agent.finish",
      payload: {
        text: fallbackText,
        steps: currentStep,
      },
    });

    return {
      status: "max_steps_reached",
      text: fallbackText,
      steps: currentStep,
    };
  } catch (err: any) {
    const isUnauthorized =
      err?.status === 401 ||
      err?.status === 403 ||
      err?.statusCode === 401 ||
      err?.statusCode === 403 ||
      err?.name === "AuthenticationError" ||
      (typeof err?.message === "string" &&
        (err.message.includes("401") ||
          err.message.toLowerCase().includes("unauthorized") ||
          err.message.toLowerCase().includes("authentication error") ||
          err.message.toLowerCase().includes("incorrect api key")));

    if (isUnauthorized) {
      await onEvent({
        step: currentStep,
        type: "error",
        payload: {
          code: "model_unauthorized",
          message: "Model access isn't set up. Check your API key.",
        },
      });

      return {
        status: "error",
        error: "model_unauthorized",
        steps: currentStep,
      };
    }

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
