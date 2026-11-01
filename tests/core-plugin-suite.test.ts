import { describe, it, expect, afterEach } from "bun:test";
import { rm } from "node:fs/promises";
import { capabilityBus } from "../server/plugins/bus";
import { pluginRegistry } from "../server/plugins/registry";
import { db } from "../server/workspace/db";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party/index";
import { getAgentHomeRoot } from "../server/system/agentHome";
import path from "node:path";

const WS = "test-core-suite-ws";
const PROBE_DIR = `core-probe-${Date.now().toString(36)}`;

afterEach(async () => {
  db.query("DELETE FROM notes WHERE workspace_id = ?").run(WS);
  await rm(path.join(getAgentHomeRoot(), PROBE_DIR), { recursive: true, force: true });
});

describe("Core plugin suite (#247)", () => {
  it("registers files + notes capabilities on the bus", () => {
    initializeFirstPartyPlugins();
    const ids = new Set(capabilityBus.getCapabilities({ enabledOnly: false }).map((c) => c.id));
    for (const id of ["files.list", "files.read", "files.write", "files.edit", "files.search", "notes.add", "notes.list", "notes.get"]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("marks the suite as core, sources + onboarding stay first-party", () => {
    initializeFirstPartyPlugins();
    const trust = (id: string) => pluginRegistry.get(id)?.manifest.trust;
    for (const id of ["search", "browser", "sandbox", "files", "notes"]) {
      expect(trust(id)).toBe("core");
    }
    expect(trust("sources")).toBe("first-party");
    expect(trust("onboarding")).toBe("first-party");
  });

  it("notes add/list/get roundtrip in workspace scope", async () => {
    initializeFirstPartyPlugins();
    const added: any = await capabilityBus.invoke("notes.add", { workspaceId: WS, title: "Probe", body: "hello" }, { workspaceId: WS });
    expect(added.success).toBe(true);
    expect(added.data.ok).toBe(true);
    const listed: any = await capabilityBus.invoke("notes.list", { workspaceId: WS }, { workspaceId: WS });
    expect(listed.success).toBe(true);
    expect(listed.data.data.items.length).toBe(1);
    expect(listed.data.data.items[0].title).toBe("Probe");
    const got: any = await capabilityBus.invoke("notes.get", { id: added.data.id, workspaceId: WS }, { workspaceId: WS });
    expect(got.success).toBe(true);
    expect(got.data.data.body).toBe("hello");
  });

  it("notes.get rejects unknown ids without leaking", async () => {
    initializeFirstPartyPlugins();
    const got: any = await capabilityBus.invoke("notes.get", { id: "note_nope", workspaceId: WS }, { workspaceId: WS });
    expect(got.success).toBe(true);
    expect(got.data.ok).toBe(false);
  });

  it("files write/read/list roundtrip inside agent-home", async () => {
    initializeFirstPartyPlugins();
    const written: any = await capabilityBus.invoke("files.write", { path: `${PROBE_DIR}/probe.txt`, content: "core suite" }, {});
    expect(written.success).toBe(true);
    const read: any = await capabilityBus.invoke("files.read", { path: `${PROBE_DIR}/probe.txt` }, {});
    expect(read.success).toBe(true);
    expect(read.data.data.content).toContain("core suite");
    const listed: any = await capabilityBus.invoke("files.list", { path: PROBE_DIR }, {});
    expect(listed.success).toBe(true);
    expect(listed.data.data.entries.some((e: any) => e.name === "probe.txt")).toBe(true);
  });

  it("files rejects path traversal", async () => {
    initializeFirstPartyPlugins();
    const read: any = await capabilityBus.invoke("files.read", { path: "../outside.txt" }, {});
    expect(read.data.ok).toBe(false);
  });
});
