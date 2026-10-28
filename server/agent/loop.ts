import { z } from "zod";
import { config } from "../config";
import { llm, MODEL_ID } from "./llm";
import { defaultTools } from "./tools";
import type { AgentTool } from "./tools/types";
import { loadSkill, isTabSynthesisIntent, isPluginSynthesisIntent, isResearchIntent, isWorldPlanningIntent } from "./skills";
import { initializeFirstPartyPlugins } from "../plugins/first-party";
import { pluginRegistry } from "../plugins/registry";
import { appendCityMessage, getCityConversationMessages } from "../workspace/conversations";
import path from "node:path";

// Auto-register first party plugins
initializeFirstPartyPlugins();

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
  origin?: "dock-add" | "chat";
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
    origin = "chat",
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
      payload: { prompt, cityId, origin, model: modelId },
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

    // Context-aware dynamic skill injection and progressive disclosure
    let activeSystemPrompt = systemPrompt;

    // Progressive Disclosure: Summarize installed plugins
    const installedPlugins = pluginRegistry.list({ enabledOnly: true });
    if (installedPlugins.length > 0) {
      const summaryLines = installedPlugins.map(
        (p) => `- ${p.name} (${p.id}): ${p.manifest.description} [${(p.manifest.capabilities || []).map((c) => c.id).join(", ")}]`
      );
      activeSystemPrompt = `${activeSystemPrompt}\n\n## Installed Plugins (Discoverable via find_capabilities & invoke_capability):\n${summaryLines.join("\n")}`;
    }

    // Reflective Execution & Failure Retry Guidelines
    activeSystemPrompt = `${activeSystemPrompt}\n\n---\n## Execution Introspection & Failure Retry Protocol\n- When a tool or capability invocation returns an error, do NOT fail silently or give up.\n- Use inspect_execution(executionId) or list_recent_executions to inspect the root cause, schema mismatches, or system boundaries.\n- Adjust the input arguments, supply missing required parameters, or invoke a suitable fallback capability.`;

    if (origin === "dock-add" || isTabSynthesisIntent(prompt)) {
      try {
        const tabSkillPrompt = await loadSkill("create-tab");
        activeSystemPrompt = `${activeSystemPrompt}\n\n---\n## Specialized Skill: Dynamic Tab Synthesis\n${tabSkillPrompt}`;
      } catch {
        // Non-fatal
      }
    }

    if (isPluginSynthesisIntent(prompt)) {
      try {
        const pluginSkillPrompt = await loadSkill("synthesize-plugin");
        activeSystemPrompt = `${activeSystemPrompt}\n\n---\n## Specialized Skill: Synthesize & Modify PolyDocks Plugins\n${pluginSkillPrompt}`;
      } catch {
        // Non-fatal
      }
    }

    if (origin === "dock-add") {
      activeSystemPrompt = `${activeSystemPrompt}\n\n---\n## Dock Add Request Instructions (origin: dock-add)\n1. Build exactly one tool for this request using create_tab.\n2. If sources or information are needed (such as flashcards, reading list, or timeline), research first using search_web or city context.\n3. Choose a fitting catalog icon name for the tool.\n4. Call open_tab to mount and open the created tool in the workspace.\n5. In your final text response, reply with at most one sentence confirming the tool was mounted.`;
    }

    // Manifest-driven skills & fallback
    const lowerPrompt = prompt.toLowerCase();
    let researchSkillInjected = false;

    for (const plugin of installedPlugins) {
      if (plugin.manifest.skill) {
        const { file, triggers } = plugin.manifest.skill;
        const matchesTrigger = triggers.some((t) => lowerPrompt.includes(t.toLowerCase()));
        if (matchesTrigger || (Boolean(cityId) && plugin.id === "search")) {
          try {
            const skillName = path.basename(file, ".md");
            const skillPrompt = await loadSkill(skillName);
            const skillHeading =
              plugin.id === "search"
                ? "Web Research & Primary Source Discovery (TinyFish)"
                : plugin.name;
            activeSystemPrompt = `${activeSystemPrompt}\n\n---\n## Specialized Skill: ${skillHeading}\n${skillPrompt}`;
            if (plugin.id === "search") researchSkillInjected = true;
          } catch {
            // Non-fatal
          }
        }
      }
    }

    if (!researchSkillInjected && (isResearchIntent(prompt) || Boolean(cityId))) {
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

    // Initialize conversation messages with SQLite persistence
    let effectiveHistory = history;
    if (cityId && history.length === 0) {
      const persisted = getCityConversationMessages(cityId, 20);
      effectiveHistory = persisted.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      }));
    }

    if (cityId) {
      appendCityMessage(cityId, "user", prompt);
    }

    const messages: any[] = [
      {
        role: "system",
        content: cityId
          ? `${activeSystemPrompt}\nActive City Workspace: ${cityId}`
          : activeSystemPrompt,
      },
      ...effectiveHistory,
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
        if (cityId) {
          appendCityMessage(cityId, "assistant", finalText);
        }
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

    if (cityId) {
      appendCityMessage(cityId, "assistant", fallbackText);
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
