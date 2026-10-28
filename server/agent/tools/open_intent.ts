import { z } from "zod";
import type { AgentTool } from "./types";
import {
  resolveSafeCityPath,
  updateWorkspaceState,
  appendAuditLog,
} from "../../workspace/cityWorkspace";

export interface OpenIntentPayload {
  kind?:
    | "tutorial"
    | "video"
    | "paper"
    | "course"
    | "compare"
    | "notes"
    | "repo"
    | "quest"
    | "custom"
    | (string & {});
  title?: string;
  targetPath?: string;
  questId?: string;
  xp?: number;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenIntentArgs {
  tabId: string;
  cityId?: string;
  url?: string;
  payload?: OpenIntentPayload;
}

/**
 * Validates untrusted URLs or paths safely against traversal and dangerous protocols.
 */
function validateSafeTargetUrl(url: string, cityId: string): void {
  const trimmed = url.trim().toLowerCase();

  // Reject script execution and non-standard protocols
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:") ||
    trimmed.startsWith("file:")
  ) {
    throw new Error(`Security Violation: Unsafe URL protocol in "${url}"`);
  }

  // If http or https, validate standard URL structure
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL format: "${url}"`);
    }
    return;
  }

  // Otherwise, treat as relative path within city workspace
  if (url.includes("..") || url.startsWith("/")) {
    throw new Error(`Security Violation: Invalid relative path "${url}" in city "${cityId}"`);
  }
}

export const open_intent: AgentTool<OpenIntentArgs> = {
  name: "open_intent",
  description:
    "Dispatches an open intent to focus, prime, and materialize a tool tab in the Agentic Dock tray with specific study or work content.",
  schema: z.object({
    tabId: z
      .string()
      .min(1)
      .describe(
        "Identifier of the target dock tab (e.g. 'browser', 'notes', 'papers', 'files', 'terminal', 'flashcards', or dynamic tab id)"
      ),
    cityId: z.string().optional().describe("City workspace scope (defaults to active city)"),
    url: z
      .string()
      .optional()
      .describe("Optional URL (for Browser/Papers/Sources) or relative file path (for Notes/Files)"),
    payload: z
      .object({
        kind: z
          .enum([
            "tutorial",
            "video",
            "paper",
            "course",
            "compare",
            "notes",
            "repo",
            "quest",
            "custom",
          ])
          .or(z.string())
          .optional()
          .describe("Semantic intent kind for study or work flows"),
        title: z.string().optional().describe("Human-readable title or label for the primed content"),
        targetPath: z.string().optional().describe("Relative target file path within the city workspace"),
        questId: z.string().optional().describe("Quest identifier to attach for XP progression"),
        xp: z.number().optional().describe("XP value associated with this study or work task"),
        params: z.record(z.string(), z.unknown()).optional().describe("Additional query parameters or options"),
      })
      .passthrough()
      .optional()
      .describe("Contextual priming payload for the target tab"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId || "default";

    // Validate URL/path safety
    if (args.url) {
      validateSafeTargetUrl(args.url, targetCity);

      // If relative path, ensure safe resolution within city workspace
      if (!args.url.startsWith("http://") && !args.url.startsWith("https://")) {
        await resolveSafeCityPath(targetCity, args.url);
      }
    }

    const updates: Parameters<typeof updateWorkspaceState>[1] = {
      activeTab: args.tabId,
      lastIntent: {
        tabId: args.tabId,
        url: args.url,
        payload: args.payload,
        timestamp: new Date().toISOString(),
      },
    };

    if (args.url) {
      updates.currentURL = args.url;

      // Automatically register source item in openSources for study tabs
      if (
        args.tabId === "browser" ||
        args.tabId === "papers" ||
        args.tabId === "sources" ||
        args.payload?.kind === "paper" ||
        args.payload?.kind === "tutorial" ||
        args.payload?.kind === "video" ||
        args.payload?.kind === "course"
      ) {
        updates.openSources = [
          {
            title: args.payload?.title || args.url,
            url: args.url,
            kind: args.payload?.kind || "article",
            openedAt: new Date().toISOString(),
            questId: args.payload?.questId,
          },
        ];
      }
    }

    if (args.payload?.questId) {
      updates.activeQuestId = args.payload.questId;
    }

    // Persist workspace layout state
    await updateWorkspaceState(targetCity, updates);

    // Record intent dispatch in audit trail
    await appendAuditLog(targetCity, "open_intent", {
      tabId: args.tabId,
      url: args.url,
      payload: args.payload,
    });

    return {
      success: true,
      tabId: args.tabId,
      cityId: targetCity,
      url: args.url,
      payload: args.payload,
      action: "tab.prime",
      trayAction: "tray.open",
      persisted: true,
      message: `Materialized tab intent "${args.tabId}" in city "${targetCity}".`,
    };
  },
};
