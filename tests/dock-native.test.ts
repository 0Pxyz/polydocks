import { describe, it, expect } from "bun:test";
import { ROOT_DOCK_TOOLS, CORE_DOCK_TOOLS } from "../src/features/dock/AgenticDock";
import { createItemsForQuery } from "../src/lib/dock/dockModel";
import app from "../server/index";

describe("Dock Native Architecture (core tools only)", () => {
  it("CORE_DOCK_TOOLS contains the curated core set", () => {
    const toolIds = ROOT_DOCK_TOOLS.map((t) => t.id);
    expect(toolIds).toEqual(["agent", "onboarding", "browser", "plugins", "creations", "store", "settings"]);

    const agent = ROOT_DOCK_TOOLS.find((t) => t.id === "agent");
    expect(agent?.isAgent).toBe(true);
    expect(agent?.label).toContain("Poly");

    const browser = ROOT_DOCK_TOOLS.find((t) => t.id === "browser");
    expect(browser?.label).toContain("Browser");

    const tools = CORE_DOCK_TOOLS.find((t) => t.id === "plugins");
    expect(tools?.label).toContain("Tools");
  });

  it("retired knowledge-map routes stay gone", async () => {
    const res = await app.fetch(new Request("http://localhost:3000/api/cities/x/files"));
    expect(res.status).toBe(404);
  });

  it("create suggestions are honest (derived from the query, never static)", () => {
    const rows = createItemsForQuery("Stoicism");
    expect(rows.length).toBe(1);
    expect(rows[0].label).toContain("Stoicism");
    expect(rows[0].kind).toBe("create");
    expect(createItemsForQuery("   ")).toEqual([]);
  });
});
