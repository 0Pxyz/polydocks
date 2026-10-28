import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import type { AgentTool } from "./types";
import { getWorkspaceState, resolveSafeCityPath } from "../../workspace/cityWorkspace";

const KNOWN_BUILTIN_TABS = new Set([
  "browser",
  "notes",
  "papers",
  "files",
  "terminal",
  "flashcards",
  "sources",
  "quests",
  "world",
  "theme",
]);

export interface InspectTabArgs {
  tabId?: string;
  cityId?: string;
}

export const inspect_tab: AgentTool<InspectTabArgs> = {
  name: "inspect_tab",
  description:
    "Inspects the active state or loaded content of dock tabs. Only call when debugging or when the user asks to inspect tab state.",
  schema: z.object({
    tabId: z
      .string()
      .optional()
      .describe(
        "Optional tab identifier to inspect (e.g. 'browser', 'notes', or dynamic tab id). If omitted, inspects active tab and workspace dock state."
      ),
    cityId: z.string().optional().describe("City workspace scope"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId || "default";
    const workspace = await getWorkspaceState(targetCity);

    if (!args.tabId) {
      return {
        cityId: targetCity,
        activeTab: workspace.activeTab || "browser",
        currentURL: workspace.currentURL,
        openSources: workspace.openSources || [],
        activeQuestId: workspace.activeQuestId,
        lastIntent: workspace.lastIntent,
        pinnedTabs: workspace.pinnedTabs || [],
      };
    }

    const isBuiltin = KNOWN_BUILTIN_TABS.has(args.tabId);
    let dynamicManifest: Record<string, unknown> | undefined;

    if (!isBuiltin) {
      try {
        const manifestPath = await resolveSafeCityPath(
          targetCity,
          path.join("tabs", args.tabId, "manifest.json")
        );
        const raw = await fs.readFile(manifestPath, "utf-8");
        dynamicManifest = JSON.parse(raw);
      } catch {
        // Tab may not have manifest yet or is not synthesized
      }
    }

    return {
      tabId: args.tabId,
      cityId: targetCity,
      kind: isBuiltin ? "builtin" : dynamicManifest ? "dynamic" : "custom",
      isActive: workspace.activeTab === args.tabId,
      currentURL: workspace.activeTab === args.tabId ? workspace.currentURL : undefined,
      openSources: workspace.openSources || [],
      lastIntent:
        workspace.lastIntent?.tabId === args.tabId ? workspace.lastIntent : undefined,
      manifest: dynamicManifest,
    };
  },
};
