import { describe, expect, test } from "bun:test";
import { defaultTools } from "../server/agent/tools/index";
import { dock_search } from "../server/agent/tools/dock_search";
import { dock_pin } from "../server/agent/tools/dock_pin";
import { dock_unpin } from "../server/agent/tools/dock_unpin";
import { dock_close } from "../server/agent/tools/dock_close";

const ctx = { step: 0 } as any;

describe("dock agent tools", () => {
  test("registers dock_search, dock_pin, dock_unpin and dock_close", () => {
    const names = defaultTools.map((tool) => tool.name);
    for (const name of ["dock_search", "dock_pin", "dock_unpin", "dock_close"]) {
      expect(names).toContain(name);
    }
  });

  test("dock_search finds builtins by query", async () => {
    const result = (await dock_search.execute({ query: "browser" }, ctx)) as any;
    expect(result.success).toBe(true);
    const ids = result.results.map((row: any) => row.id);
    expect(ids).toContain("browser");
    for (const row of result.results) {
      expect(typeof row.id).toBe("string");
      expect(typeof row.title).toBe("string");
      expect(typeof row.description).toBe("string");
      expect(typeof row.kind).toBe("string");
      expect(typeof row.installed).toBe("boolean");
    }
  });

  test("dock_search with an empty query returns the curated core", async () => {
    const result = (await dock_search.execute({}, ctx)) as any;
    expect(result.success).toBe(true);
    const ids = result.results.map((row: any) => row.id);
    expect(ids).toContain("agent");
    expect(ids).toContain("maps");
  });

  test("two keystrokes find an installed plugin", async () => {
    const result = (await dock_search.execute({ query: "flas" }, ctx)) as any;
    const ids = result.results.map((row: any) => row.id);
    expect(ids).toContain("flashcards");
  });

  test("dock_pin succeeds for a builtin and emits a dock.pin action", async () => {
    const result = (await dock_pin.execute({ id: "browser" }, ctx)) as any;
    expect(result.success).toBe(true);
    expect(result.action).toBe("dock.pin");
    expect(result.message.length).toBeGreaterThan(0);
  });

  test("dock_pin fails visibly for unknown ids", async () => {
    const result = (await dock_pin.execute(
      { id: "test_no_such_dock_item", cityId: "test_no_such_city" },
      ctx
    )) as any;
    expect(result.success).toBe(false);
    expect(result.action).toBe("dock.pin");
    expect(result.message).toMatch(/no dock item/i);
  });

  test("dock_pin refuses store-only plugins with install guidance", async () => {
    const search = (await dock_search.execute({ query: "" }, ctx)) as any;
    const storeOnly = search.results.find((row: any) => row.kind === "store");
    if (!storeOnly) return; // No seeded store in this environment; nothing to assert.
    const result = (await dock_pin.execute({ id: storeOnly.id }, ctx)) as any;
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/install/i);
  });

  test("dock_unpin refuses to remove the map", async () => {
    const result = (await dock_unpin.execute({ id: "maps" }, ctx)) as any;
    expect(result.success).toBe(false);
    expect(result.action).toBe("dock.unpin");
    expect(result.message).toMatch(/always in the dock/i);
  });

  test("dock_close succeeds for a builtin tab without deleting", async () => {
    const result = (await dock_close.execute({ id: "flashcards" }, ctx)) as any;
    expect(result.success).toBe(true);
    expect(result.action).toBe("dock.close");
    expect(result.message).toMatch(/nothing was deleted/i);
  });

  test("dock_close fails visibly for unknown ids", async () => {
    const result = (await dock_close.execute(
      { id: "test_no_such_dock_item", cityId: "test_no_such_city" },
      ctx
    )) as any;
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no dock item/i);
  });
});
