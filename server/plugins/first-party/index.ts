import { z } from "zod";
import { pluginRegistry } from "../registry";
import { capabilityBus } from "../bus";
import { tinyfish } from "../../discovery/tinyfish";
import { readCityFile, writeCityFile, getCityContext } from "../../workspace/cityWorkspace";
import type { PluginManifest } from "../manifest";
import { registerSourcesPlugin } from "../sources";
import { registerCitiesPlugin } from "../cities";

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
  trust: "first-party",
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
    file: "server/agent/skills/web-research.md",
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
  name: "Primary Source Reader",
  version: "1.0.0",
  description: "Displays external primary sources and papers inside the dock reader view",
  icon: "Globe",
  trust: "first-party",
  capabilities: [
    {
      id: "browser.open",
      title: "Open Source in Browser",
      description: "Opens an external source URL in the active dock Browser view.",
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
      title: "Research & Sources",
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
 * 3. Writing Plugin
 */
export const writingPluginManifest: PluginManifest = {
  apiVersion: 1,
  id: "writing",
  name: "Notes & Synthesis",
  version: "1.0.0",
  description: "Workspace markdown note reader and synthesizer",
  icon: "NotePencil",
  trust: "first-party",
  capabilities: [
    {
      id: "writing.read_file",
      title: "Read Workspace File",
      description: "Reads file content safely from within the active city workspace.",
      input: z.object({
        path: z.string().min(1).describe("Relative path within city workspace"),
      }),
      risk: "read",
    },
    {
      id: "writing.write_file",
      title: "Write Workspace File",
      description: "Writes content to a file within the active city workspace.",
      input: z.object({
        path: z.string().min(1).describe("Relative path within city workspace"),
        content: z.string().describe("Text or markdown content"),
      }),
      risk: "write",
    },
  ],
  surfaces: [
    {
      id: "notes",
      title: "Notes",
      icon: "NotePencil",
      variant: "immersive",
      entry: "NotesView",
    },
  ],
  permissions: [
    {
      type: "fs",
      scope: "city",
      mode: "write",
    },
  ],
};

/**
 * 4. Workspace Plugin
 */
export const workspacePluginManifest: PluginManifest = {
  apiVersion: 1,
  id: "workspace",
  name: "City Workspace Inventory",
  version: "1.0.0",
  description: "Inspects city workspace files, artifacts, and context",
  icon: "Folder",
  trust: "first-party",
  capabilities: [
    {
      id: "workspace.get_context",
      title: "Get City Context",
      description: "Retrieves complete city inventory of notes, sources, and dynamic tabs.",
      input: z.object({
        cityId: z.string().optional().describe("Target city slug identifier"),
      }),
      risk: "read",
    },
    {
      id: "workspace.list_artifacts",
      title: "List Workspace Artifacts",
      description: "Lists generated notes, tabs, and curated feeds in the city.",
      input: z.object({
        cityId: z.string().optional(),
      }),
      risk: "read",
    },
  ],
  permissions: [
    {
      type: "fs",
      scope: "city",
      mode: "read",
    },
  ],
};

/**
 * Register all first-party plugins and their executable handlers.
 */
export function initializeFirstPartyPlugins(): void {
  // Contract plugins (sources, cities): single definitions that generate
  // the bus registration, HTTP route and CLI command.
  registerSourcesPlugin();
  registerCitiesPlugin();

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

  // 3. Writing Plugin
  pluginRegistry.install(writingPluginManifest);
  capabilityBus.register("writing", writingPluginManifest.capabilities[0], async (input, ctx) => {
    const cityId = ctx.cityId || "global";
    const content = await readCityFile(cityId, input.path);
    return { path: input.path, content };
  });
  capabilityBus.register("writing", writingPluginManifest.capabilities[1], async (input, ctx) => {
    const cityId = ctx.cityId || "global";
    await writeCityFile(cityId, input.path, input.content);
    return { success: true, path: input.path, cityId };
  });

  // 4. Workspace Plugin
  pluginRegistry.install(workspacePluginManifest);
  capabilityBus.register("workspace", workspacePluginManifest.capabilities[0], async (input, ctx) => {
    const targetCity = input.cityId || ctx.cityId || "global";
    return await getCityContext(targetCity);
  });
  capabilityBus.register("workspace", workspacePluginManifest.capabilities[1], async (input, ctx) => {
    const targetCity = input.cityId || ctx.cityId || "global";
    const context = await getCityContext(targetCity);
    return {
      cityId: targetCity,
      artifacts: [
        ...context.notes.map((n) => ({ type: "note", path: n })),
        ...context.sources.map((s) => ({ type: "source", url: s.url, title: s.title })),
        ...context.dynamicTabs.map((t) => ({ type: "tab", id: t.id, title: t.title })),
      ],
    };
  });
}
