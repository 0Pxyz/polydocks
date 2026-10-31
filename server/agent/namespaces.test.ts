import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { buildResponsesTools, resolveResponsesToolName } from "./namespaces";
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
  it("covers the full catalog 1:1 minus the superseded find_capabilities root", () => {
    const { tools, nameMap } = buildResponsesTools(fullTools);
    const offered = new Set<string>();
    for (const t of tools) {
      if (t.type === "namespace") for (const fn of t.tools) offered.add(fn.name);
      else if (t.type === "function") offered.add(t.name);
    }
    for (const t of fullTools) {
      if (t.name === "find_capabilities") {
        expect(nameMap.has("find_capabilities")).toBe(false);
        continue;
      }
      const sanitized = t.name.replaceAll(".", "_");
      const dots = (t.name.match(/\./g) ?? []).length;
      const key = dots <= 1 ? t.name : sanitized;
      expect(nameMap.get(key)).toBe(t.name);
    }
    // Every non-superseded tool is offered exactly once.
    expect(offered.size).toBe(fullTools.length - 1);
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
});
