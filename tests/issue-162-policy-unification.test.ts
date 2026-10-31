import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../server/config";
import { db } from "../server/workspace/db";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party";
import { collectReceipt } from "../server/agent/receipts";

const WS = "test-162-policy";
const TEST_DIR = path.resolve(process.cwd(), "workspace", WS);

describe("Issue #162 — one policy, one audit", () => {
  beforeAll(async () => {
    initializeFirstPartyPlugins();
    await fs.mkdir(TEST_DIR, { recursive: true }).catch(() => {});
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("create_plugin without approval is denied for actor=agent (no bypass)", async () => {
    const { create_plugin } = await import("../server/agent/tools/create_plugin");
    const out: any = await create_plugin.execute(
      {
        id: "policy-plugin-1",
        name: "P",
        description: "d",
        code: "const a = 1;",
        workspaceId: WS,
      } as any,
      { workspaceId: WS, step: 1, actor: "agent" } as any
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("approval_required");
  });

  it("modify_plugin without approval is denied for actor=agent", async () => {
    const { modify_plugin } = await import("../server/agent/tools/modify_plugin");
    const out: any = await modify_plugin.execute(
      { id: "policy-plugin-1", changeSummary: "x", code: "const a = 2;" } as any,
      { workspaceId: WS, step: 1, actor: "agent" } as any
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("approval_required");
  });

  it("promote_to_plugin without approval is denied for actor=agent", async () => {
    const { promote_to_plugin } = await import("../server/agent/tools/promote_to_plugin");
    const out: any = await promote_to_plugin.execute(
      { id: "whatever" } as any,
      { workspaceId: WS, step: 1, actor: "agent" } as any
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("approval_required");
  });

  it("create_plugin preserves approval_required envelope and honors never/auto", async () => {
    const { create_plugin } = await import("../server/agent/tools/create_plugin");
    const saved = (config as any).INSTALL_POLICY;

    // ask (default): no approval -> denied envelope
    (config as any).INSTALL_POLICY = "ask";
    const paused: any = await create_plugin.execute(
      {
        id: "policy-plugin-2",
        name: "P",
        description: "d",
        code: "const a = 1;",
        workspaceId: WS,
      } as any,
      { workspaceId: WS, step: 1, actor: "agent" } as any
    );
    expect(paused.ok).toBe(false);
    expect(paused.code).toBe("approval_required");

    // never: install_denied even with approval
    (config as any).INSTALL_POLICY = "never";
    try {
      const denied: any = await create_plugin.execute(
        {
          id: "policy-plugin-2",
          name: "P",
          description: "d",
          code: "const a = 1;",
          workspaceId: WS,
          userApproved: true,
        } as any,
        { workspaceId: WS, step: 1, actor: "agent" } as any
      );
      expect(denied.ok).toBe(false);
      expect(denied.code).toBe("install_denied");
    } finally {
      (config as any).INSTALL_POLICY = saved;
    }
  });

  it("native twins run through the bus (audited in executions)", async () => {
    const { open_source } = await import("../server/agent/tools/open_source");
    const { invoke_capability } = await import("../server/agent/tools/invoke_capability");

    const before = (db.query("SELECT COUNT(*) as n FROM executions").get() as any).n;

    const opened: any = await open_source.execute(
      { url: "https://example.com/a" } as any,
      { workspaceId: WS, step: 1, actor: "agent" } as any
    );
    expect(opened.success).toBe(true);
    expect(opened.action).toBe("browser.open");

    const listed: any = await invoke_capability.execute(
      { id: "sources.list", input: { workspaceId: WS } } as any,
      { workspaceId: WS, step: 1, actor: "agent" } as any
    );
    expect(listed.success).toBe(true);

    const after = (db.query("SELECT COUNT(*) as n FROM executions").get() as any).n;
    expect(after).toBeGreaterThan(before);

    const rows = db.query("SELECT capability_id FROM executions ORDER BY rowid DESC LIMIT 20").all() as any[];
    const ids = rows.map((r) => r.capability_id);
    expect(ids).toContain("browser.open");
    expect(ids).toContain("sources.list");
  });

  it("fetch_page uses sources.add (no raw JSON dump) and is audited", async () => {
    const { fetch_page } = await import("../server/agent/tools/fetch_page");
    const out: any = await fetch_page.execute(
      { urls: ["https://example.com/162-test"], workspaceId: WS, saveToSources: true } as any,
      { workspaceId: WS, step: 1, actor: "agent" } as any
    );
    expect(out.count).toBe(1);
    expect(out.pages[0].markdown.length).toBeGreaterThan(0);

    // Legacy raw dump path is gone: no sources/*.json file for this URL.
    const sourcesDir = path.join(TEST_DIR, "sources");
    let files: string[] = [];
    try {
      files = await fs.readdir(sourcesDir);
    } catch {
      files = [];
    }
    expect(files.filter((f) => f.endsWith(".json")).length).toBe(0);

    const rows = db.query("SELECT capability_id FROM executions ORDER BY rowid DESC LIMIT 20").all() as any[];
    const ids = rows.map((r) => r.capability_id);
    expect(ids).toContain("search.fetch");
  });

  it("facade plugins.operate resolves first-party capabilities (not only contracts)", async () => {
    const { invokeCapability } = await import("../server/facade/shared");
    for (const [plugin, cap, input] of [
      ["browser", "open", { url: "https://example.com/facade", workspaceId: WS }],
      ["sources", "list", { workspaceId: WS }],
    ] as Array<[string, string, Record<string, unknown>]>) {
      const out: any = await invokeCapability(plugin, cap, input, { actor: "user", workspaceId: WS });
      expect(out.ok).toBe(true);
    }
    const unknown: any = await invokeCapability("nope", "missing", {}, { actor: "user" });
    expect(unknown.ok).toBe(false);
    expect(unknown.code).toBe("unknown_capability");
  });

  it("approval_required never counts as success in receipts", async () => {
    const denied = { ok: false, error: "Install policy is 'ask'", retryable: false, code: "approval_required" };
    const paused = { status: "approval_required", requiresConfirmation: true, message: "paused" };
    expect(collectReceipt("create_plugin", {}, denied).ok).toBe(false);
    expect(collectReceipt("modify_plugin", {}, paused).ok).toBe(false);
    // Even a wrapped success with approval text must not count.
    expect(collectReceipt("create_plugin", {}, { success: true, status: "approval_required" }).ok).toBe(false);
  });
});
