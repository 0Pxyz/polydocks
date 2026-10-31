import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { buildResponsesTools, hasReservedWebSearchCollision, resolveResponsesToolName } from "./namespaces";
import { fullTools, minimalTools } from "./tools";
import { INTENT_TOOL_DENYLIST } from "./intent";
import type { AgentTool } from "./tools/types";

function fakeTool(name: string): AgentTool {
  return {
    name,
    description: `${name} description`,
    schema: z.object({}).passthrough(),
    execute: async () => ({ ok: true }),
  };
}

/** Native tool search replaces custom discovery (#222). */
describe("Responses namespace builder", () => {
  it("covers the full catalog 1:1 minus the superseded custom roots", () => {
    const { tools, nameMap } = buildResponsesTools(fullTools);
    const offered = new Set<string>();
    for (const t of tools) {
      if (t.type === "namespace") for (const fn of t.tools) offered.add(fn.name);
      else if (t.type === "function") offered.add(t.name);
    }
    for (const t of fullTools) {
      if (t.name === "find_capabilities" || t.name === "search_web") {
        expect(nameMap.has(t.name)).toBe(false);
        continue;
      }
      const dots = (t.name.match(/\./g) ?? []).length;
      const key = dots <= 1 ? t.name : t.name.replaceAll(".", "_");
      expect(nameMap.get(key)).toBe(t.name);
    }
    // Every non-superseded tool is offered exactly once.
    expect(offered.size).toBe(fullTools.length - 2);
  });

  it("keeps the custom search alias when grounding is unavailable", () => {
    const { tools, nameMap } = buildResponsesTools(fullTools, { builtinWebSearch: false });
    const offered: string[] = [];
    for (const t of tools) {
      if (t.type === "namespace") for (const fn of t.tools) offered.push(fn.name);
      else if (t.type === "function") offered.push(t.name);
    }
    expect(offered).toContain("search_web");
    expect(offered).not.toContain("find_capabilities");
    expect(nameMap.get("search_web")).toBe("search_web");
    expect(offered.length).toBe(fullTools.length - 1);
  });

  it("rejects reserved browser.* names for grounding", () => {
    expect(hasReservedWebSearchCollision(["dock_search", "cap_browser_open"])).toBe(false);
    expect(hasReservedWebSearchCollision(["browser.open"])).toBe(true);
    expect(hasReservedWebSearchCollision(["browser.search", "dock_search"])).toBe(true);
  });

  it("covers the minimal verb catalog the same way", () => {
    const { tools } = buildResponsesTools(minimalTools);
    const offered = new Set<string>();
    for (const t of tools) {
      if (t.type === "namespace") for (const fn of t.tools) offered.add(fn.name);
      else if (t.type === "function") offered.add(t.name);
    }
    expect(offered.size).toBe(minimalTools.length - 1);
    expect([...offered].join(" ")).not.toContain("find_capabilities");
  });

  it("keeps every namespace under ~10 functions with a clear description", () => {
    const { namespaces } = buildResponsesTools(fullTools);
    expect(namespaces.length).toBeGreaterThan(0);
    for (const ns of namespaces) {
      expect(ns.type).toBe("namespace");
      expect(ns.name).not.toContain(".");
      expect(ns.description.length).toBeGreaterThan(10);
      expect(ns.tools.length).toBeLessThanOrEqual(9);
      for (const fn of ns.tools) {
        expect(fn.type).toBe("function");
        expect((fn.name.match(/\./g) ?? []).length).toBeLessThanOrEqual(1);
        expect(fn.defer_loading).toBe(true);
      }
    }
  });

  it("declares exactly one tool_search and keeps invoke_capability immediate", () => {
    const { tools } = buildResponsesTools(fullTools);
    const searches = tools.filter((t) => t.type === "tool_search");
    expect(searches).toHaveLength(1);
    const immediate = tools.filter((t) => t.type === "function");
    expect(immediate.map((t) => t.name)).toEqual(["invoke_capability"]);
    expect((immediate[0] as any).defer_loading).not.toBe(true);
  });

  it("groups capability tools by plugin domain", () => {
    const scoped = [
      fakeTool("cap.sources.add"),
      fakeTool("cap.sources.list"),
      fakeTool("cap.writing.write_file"),
      fakeTool("cap.search.web"),
      fakeTool("cap.browser.open"),
      fakeTool("invoke_capability"),
    ];
    const { namespaces, nameMap } = buildResponsesTools(scoped);
    const byName = new Map(namespaces.map((n) => [n.name, n]));
    expect(byName.has("sources")).toBe(true);
    expect(byName.has("search")).toBe(false);
    // search.* and browser.* merge into the research domain.
    const research = byName.get("research");
    expect(research?.tools.length).toBe(2);
    // writing.* merges into files.
    expect(byName.get("files")?.tools.length).toBe(1);
    expect(nameMap.get("cap_sources_add")).toBe("cap.sources.add");
  });

  it("omits tool_search when nothing is deferred", () => {
    const { tools } = buildResponsesTools([fakeTool("invoke_capability")]);
    expect(tools.filter((t) => t.type === "tool_search")).toHaveLength(0);
    expect(tools.filter((t) => t.type === "function")).toHaveLength(1);
  });

  it("preserves denylist filtering (denied tools never reach namespaces)", () => {
    const denied = new Set(INTENT_TOOL_DENYLIST.theme ?? []);
    const scoped = fullTools.filter((t) => !denied.has(t.name));
    const { nameMap } = buildResponsesTools(scoped);
    for (const d of denied) expect(nameMap.has(d)).toBe(false);
    expect(nameMap.has("search_web")).toBe(false);
    expect(nameMap.has("dock_search")).toBe(true);
  });

  it("resolves plain, namespaced and unknown call names", () => {
    const { nameMap } = buildResponsesTools([fakeTool("cap.sources.add"), fakeTool("dock_search")]);
    expect(resolveResponsesToolName(nameMap, "dock_search")).toBe("dock_search");
    expect(resolveResponsesToolName(nameMap, "cap_sources_add")).toBe("cap.sources.add");
    // Namespace-qualified call: namespace + bare name.
    expect(resolveResponsesToolName(nameMap, "add", "sources")).toBe("add");
    expect(resolveResponsesToolName(nameMap, "nope")).toBe("nope");
  });

  it("resolves a namespace-prefixed guess for a flat function", () => {
    const { nameMap } = buildResponsesTools([fakeTool("apply_theme"), fakeTool("dock.open")]);
    // The model naturally calls "media.apply_theme" for the flat function
    // declared inside the media namespace — resolve, don't hard-fail.
    expect(resolveResponsesToolName(nameMap, "media.apply_theme")).toBe("apply_theme");
    // Direct names still win over the suffix fallback.
    expect(resolveResponsesToolName(nameMap, "dock.open")).toBe("dock.open");
    // Unknown qualified names still pass through for the loop's error path.
    expect(resolveResponsesToolName(nameMap, "nope.nowhere")).toBe("nope.nowhere");
  });
});
