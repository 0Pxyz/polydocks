import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../server/config";
import { db } from "../server/workspace/db";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party";
import { collectReceipt } from "../server/agent/receipts";

const CITY = "test-162-policy";
const TEST_DIR = path.resolve(process.cwd(), "workspace", CITY);

describe("Issue #162 — one policy, one audit", () => {
  beforeAll(async () => {
    initializeFirstPartyPlugins();
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("create_tab without approval is denied for actor=agent (no bypass)", async () => {
    const { create_tab } = await import("../server/agent/tools/create_tab");
    const out: any = await create_tab.execute(
      { id: "policy-tab-1", title: "T", html: "<h1>x</h1>" } as any,
      { cityId: CITY, step: 1, actor: "agent" } as any
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("approval_required");
  });

  it("update_tab without approval is denied for actor=agent", async () => {
    const { update_tab } = await import("../server/agent/tools/update_tab");
    const out: any = await update_tab.execute(
      { id: "policy-tab-1", title: "New" } as any,
      { cityId: CITY, step: 1, actor: "agent" } as any
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("approval_required");
  });

  it("promote_to_plugin without approval is denied for actor=agent", async () => {
    const { promote_to_plugin } = await import("../server/agent/tools/promote_to_plugin");
    const out: any = await promote_to_plugin.execute(
      { id: "whatever" } as any,
      { cityId: CITY, step: 1, actor: "agent" } as any
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("approval_required");
  });

  it("delete_tab preserves approval_required envelope and honors never/auto", async () => {
    const { delete_tab } = await import("../server/agent/tools/delete_tab");
    const saved = (config as any).INSTALL_POLICY;

    // ask (default): no approval -> legacy envelope
    (config as any).INSTALL_POLICY = "ask";
    const paused: any = await delete_tab.execute(
      { id: "x" } as any,
      { cityId: CITY, step: 1, actor: "agent" } as any
    );
    expect(paused.status).toBe("approval_required");
    expect(paused.requiresConfirmation).toBe(true);

    // never: install_denied even with approval
    (config as any).INSTALL_POLICY = "never";
    try {
      const denied: any = await delete_tab.execute(
        { id: "x", userApproved: true } as any,
        { cityId: CITY, step: 1, actor: "agent" } as any
      );
      expect(denied.ok).toBe(false);
      expect(denied.code).toBe("install_denied");
    } finally {
      (config as any).INSTALL_POLICY = saved;
    }
  });

  it("native twins run through the bus (audited in executions)", async () => {
    const { write_city_file } = await import("../server/agent/tools/write_city_file");
    const { read_city_file } = await import("../server/agent/tools/read_city_file");
    const { get_city_context } = await import("../server/agent/tools/get_city_context");
    const { open_source } = await import("../server/agent/tools/open_source");

    const before = (db.query("SELECT COUNT(*) as n FROM executions").get() as any).n;

    await write_city_file.execute(
      { path: "notes/162.md", content: "# hi" } as any,
      { cityId: CITY, step: 1, actor: "agent" } as any
    );
    const read: any = await read_city_file.execute(
      { path: "notes/162.md" } as any,
      { cityId: CITY, step: 1, actor: "agent" } as any
    );
    expect(read.content).toContain("# hi");

    await get_city_context.execute({} as any, { cityId: CITY, step: 1, actor: "agent" } as any);
    const opened: any = await open_source.execute(
      { url: "https://example.com/a" } as any,
      { cityId: CITY, step: 1, actor: "agent" } as any
    );
    expect(opened.success).toBe(true);
    expect(opened.action).toBe("browser.open");

    const after = (db.query("SELECT COUNT(*) as n FROM executions").get() as any).n;
    expect(after).toBeGreaterThan(before);

    const rows = db.query("SELECT capability_id FROM executions ORDER BY rowid DESC LIMIT 20").all() as any[];
    const ids = rows.map((r) => r.capability_id);
    expect(ids).toContain("writing.write_file");
    expect(ids).toContain("writing.read_file");
    expect(ids).toContain("workspace.get_context");
    expect(ids).toContain("browser.open");
  });

  it("fetch_page uses sources.add (no raw JSON dump) and is audited", async () => {
    const { fetch_page } = await import("../server/agent/tools/fetch_page");
    const out: any = await fetch_page.execute(
      { urls: ["https://example.com/162-test"], cityId: CITY, saveToSources: true } as any,
      { cityId: CITY, step: 1, actor: "agent" } as any
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
      ["browser", "open", { url: "https://example.com/facade", cityId: CITY }],
      ["writing", "write_file", { path: "notes/facade.md", content: "hi", cityId: CITY }],
      ["workspace", "get_context", { cityId: CITY }],
    ] as Array<[string, string, Record<string, unknown>]>) {
      const out: any = await invokeCapability(plugin, cap, input, { actor: "user", cityId: CITY });
      expect(out.ok).toBe(true);
    }
    const unknown: any = await invokeCapability("nope", "missing", {}, { actor: "user" });
    expect(unknown.ok).toBe(false);
    expect(unknown.code).toBe("unknown_capability");
  });

  it("approval_required never counts as success in receipts", async () => {
    const denied = { ok: false, error: "Install policy is 'ask'", retryable: false, code: "approval_required" };
    const paused = { status: "approval_required", requiresConfirmation: true, message: "paused" };
    expect(collectReceipt("create_tab", {}, denied).ok).toBe(false);
    expect(collectReceipt("delete_tab", {}, paused).ok).toBe(false);
    // Even a wrapped success with approval text must not count.
    expect(collectReceipt("create_tab", {}, { success: true, status: "approval_required" }).ok).toBe(false);
  });
});
