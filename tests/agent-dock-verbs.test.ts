import { describe, it, expect } from "bun:test";
import { fullTools, minimalTools } from "../server/agent/tools/index";
import { dockAction } from "../server/facade/shared";

/**
 * Agent dock control (#390): on the default full surface the agent can
 * list the dock and open surfaces (the dock skill already teaches this
 * flow) — previously these verbs were minimal-only, so the agent told
 * the user to tap Tools instead of opening it.
 */
describe("agent dock verbs (#390)", () => {
  it("dock.open and dock.list ship on the full surface (and stay on minimal)", () => {
    const full = new Set(fullTools.map((t) => t.name));
    const minimal = new Set(minimalTools.map((t) => t.name));
    expect(full.has("dock.open")).toBe(true);
    expect(full.has("dock.list")).toBe(true);
    expect(minimal.has("dock.open")).toBe(true);
    expect(minimal.has("dock.list")).toBe(true);
  });

  it("tabs.open returns ok with a tray.open event for the client", async () => {
    const out: any = await dockAction(
      "tabs.open",
      { tabId: "plugins" },
      { actor: "agent", workspaceId: "default" }
    );
    expect(out.ok).toBe(true);
    const types = (out.events || []).map((e: any) => e.type);
    expect(types).toContain("tray.open");
  });

  it("tabs.open passes noteId through for note deep links (#402)", async () => {
    const out: any = await dockAction(
      "tabs.open",
      { tabId: "notes", noteId: "note_deep123" },
      { actor: "agent", workspaceId: "default" }
    );
    expect(out.ok).toBe(true);
    const tray = (out.events || []).find((e: any) => e.type === "tray.open");
    expect(tray).toBeDefined();
    expect(tray.payload.noteId).toBe("note_deep123");
  });
});
