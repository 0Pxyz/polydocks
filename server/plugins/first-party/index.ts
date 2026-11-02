import { z } from "zod";
import { pluginRegistry } from "../registry";
import { capabilityBus } from "../bus";
import { tinyfish } from "../../discovery/tinyfish";
import type { PluginManifest } from "../manifest";
import { registerSourcesPlugin } from "../sources";
import { registerSandboxPlugin } from "../sandbox";
import { registerFilesPlugin } from "../files";
import { registerNotesPlugin } from "../notes";
import { registerOnboardingPlugin } from "./onboarding";

/**
 * 1. Search Plugin
 */
export const searchPluginManifest: PluginManifest = {
  apiVersion: 1,
  id: "search",
  name: "Web Discovery & Research",
  version: "1.0.0",
  description: "Autonomous web and literature search powered by TinyFish API",
  icon: "Globe",
  trust: "core",
  capabilities: [
    {
      id: "search.web",
      title: "Search Web",
      description: "Searches the web, news, or academic papers for authoritative primary sources.",
      input: z.object({
        query: z.string().min(1).describe("Search query string"),
        domainType: z.enum(["web", "news", "research_paper"]).default("web"),
        limit: z.number().int().min(1).max(10).default(5),
      }),
      risk: "external",
    },
    {
      id: "search.fetch",
      title: "Fetch Page",
      description: "Fetches and extracts clean markdown text from a webpage or paper URL.",
      input: z.object({
        url: z.string().url().describe("Target URL to fetch"),
      }),
      risk: "external",
    },
  ],
  permissions: [
    {
      type: "net",
      hosts: ["api.search.tinyfish.ai", "api.fetch.tinyfish.ai"],
    },
  ],
  skill: {
    file: "server/agent/skills/content-and-reader.md",
    triggers: [
      "search",
      "pesquise",
      "research",
      "paper",
      "fontes",
      "sources",
      "artigo",
      "tinyfish",
      "web",
      "buscar",
      "encontrar",
      "noticias",
      "news",
    ],
  },
};

/**
 * 2. Browser Plugin
 */
export const browserPluginManifest: PluginManifest = {
  apiVersion: 1,
  id: "browser",
  name: "Browser",
  version: "1.0.0",
  description: "Real Chromium browsing inside the dock",
  icon: "Globe",
  trust: "core",
  capabilities: [
    {
      id: "browser.open",
      title: "Open Source in Browser",
      description:
        "Opens an external source URL in the native Browser surface (real Chromium via Atrium; falls back to the Reader when the worker is unavailable).",
      input: z.object({
        url: z.string().url().describe("Source URL"),
        title: z.string().optional().describe("Optional title"),
      }),
      risk: "read",
    },
  ],
  surfaces: [
    {
      id: "browser",
      title: "Browser",
      icon: "Globe",
      variant: "immersive",
      entry: "SourcesView",
    },
  ],
  permissions: [
    {
      type: "net",
      hosts: ["*"],
    },
  ],
};

/**
 * Register all first-party plugins and their executable handlers.
 */
export function initializeFirstPartyPlugins(): void {
  // Contract plugins (sources, sandbox, files, notes): single definitions
  // that generate the bus registration, HTTP route and CLI command.
  registerSourcesPlugin();
  registerSandboxPlugin();
  registerFilesPlugin();
  registerNotesPlugin();
  registerOnboardingPlugin();

  // 1. Search Plugin
  pluginRegistry.install(searchPluginManifest);
  capabilityBus.register("search", searchPluginManifest.capabilities[0], async (input) => {
    return await tinyfish.search(input.query, input.domainType || "web", input.limit || 5);
  });
  capabilityBus.register("search", searchPluginManifest.capabilities[1], async (input) => {
    return await tinyfish.fetch([input.url]);
  });

  // 2. Browser Plugin
  pluginRegistry.install(browserPluginManifest);
  capabilityBus.register("browser", browserPluginManifest.capabilities[0], async (input, ctx) => {
    if (ctx.emit) {
      await ctx.emit({
        type: "browser.open",
        payload: { url: input.url, title: input.title || input.url },
      });
    }
    return { action: "browser.open", url: input.url, title: input.title || input.url };
  });
}
