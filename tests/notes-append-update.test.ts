import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { capabilityBus } from "../server/plugins/bus";
import { db } from "../server/workspace/db";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party/index";

const WS = "ws-notes-append";
const OTHER_WS = "ws-notes-append-other";

/**
 * Notes continuation contract (#351): Poly appends synthesized text without
 * touching manual edits, and updates keep omitted fields. Workspace-scoped.
 */
describe("notes append/update (#351)", () => {
  beforeEach(() => {
    initializeFirstPartyPlugins();
    for (const ws of [WS, OTHER_WS]) {
      try {
        db.query("DELETE FROM notes WHERE workspace_id = ?").run(ws);
      } catch {}
    }
  });

  afterEach(() => {
    for (const ws of [WS, OTHER_WS]) {
      try {
        db.query("DELETE FROM notes WHERE workspace_id = ?").run(ws);
      } catch {}
    }
  });

  it("registers append + update on the bus", () => {
    const ids = new Set(capabilityBus.getCapabilities({ enabledOnly: false }).map((c) => c.id));
    expect(ids.has("notes.append")).toBe(true);
    expect(ids.has("notes.update")).toBe(true);
  });

  it("append preserves manual edits and keeps order", async () => {
    const added: any = await capabilityBus.invoke(
      "notes.add",
      { workspaceId: WS, title: "Research", body: "my manual edit" },
      { workspaceId: WS }
    );
    expect(added.data.ok).toBe(true);
    const id = added.data.id as string;

    const appended: any = await capabilityBus.invoke(
      "notes.append",
      { id, text: "agent synthesis", workspaceId: WS },
      { workspaceId: WS }
    );
    expect(appended.data.ok).toBe(true);
    expect(appended.data.data.body).toBe("my manual edit\n\nagent synthesis");

    const got: any = await capabilityBus.invoke("notes.get", { id, workspaceId: WS }, { workspaceId: WS });
    expect(got.data.data.body).toContain("my manual edit");
    expect(got.data.data.body).toContain("agent synthesis");
  });

  it("append onto an empty note adds no leading separator", async () => {
    const added: any = await capabilityBus.invoke(
      "notes.add",
      { workspaceId: WS, title: "Empty", body: "" },
      { workspaceId: WS }
    );
    const appended: any = await capabilityBus.invoke(
      "notes.append",
      { id: added.data.id, text: "first line", workspaceId: WS },
      { workspaceId: WS }
    );
    expect(appended.data.data.body).toBe("first line");
  });

  it("update keeps omitted fields", async () => {
    const added: any = await capabilityBus.invoke(
      "notes.add",
      { workspaceId: WS, title: "T", body: "B" },
      { workspaceId: WS }
    );
    const id = added.data.id as string;
    const renamed: any = await capabilityBus.invoke(
      "notes.update",
      { id, title: "T2", workspaceId: WS },
      { workspaceId: WS }
    );
    expect(renamed.data.data.title).toBe("T2");
    expect(renamed.data.data.body).toBe("B");
  });

  it("list returns full bodies so reload hydrates the editor (#400)", async () => {
    const added: any = await capabilityBus.invoke(
      "notes.add",
      { workspaceId: WS, title: "Reload me", body: "persisted body text" },
      { workspaceId: WS }
    );
    expect(added.data.ok).toBe(true);
    const listed: any = await capabilityBus.invoke("notes.list", { workspaceId: WS }, { workspaceId: WS });
    expect(listed.data.ok).toBe(true);
    const row = (listed.data.data.items as any[]).find((n) => n.id === added.data.id);
    expect(row).toBeDefined();
    expect(row.title).toBe("Reload me");
    expect(row.body).toBe("persisted body text");
  });

  it("append/update reject unknown ids and foreign workspaces", async () => {
    const missing: any = await capabilityBus.invoke(
      "notes.append",
      { id: "note_nope", text: "x", workspaceId: WS },
      { workspaceId: WS }
    );
    expect(missing.data.ok).toBe(false);

    const added: any = await capabilityBus.invoke(
      "notes.add",
      { workspaceId: WS, title: "Private", body: "mine" },
      { workspaceId: WS }
    );
    const cross: any = await capabilityBus.invoke(
      "notes.append",
      { id: added.data.id, text: "intruder", workspaceId: OTHER_WS },
      { workspaceId: OTHER_WS }
    );
    expect(cross.data.ok).toBe(false);
    const crossUpdate: any = await capabilityBus.invoke(
      "notes.update",
      { id: added.data.id, title: "hijacked", workspaceId: OTHER_WS },
      { workspaceId: OTHER_WS }
    );
    expect(crossUpdate.data.ok).toBe(false);
  });
});
