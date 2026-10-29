import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { invokeCapability, dockAction, agentTask } from "../server/facade/shared";
import { pluginsOperate } from "../server/agent/tools/verbs/plugins";
import { dockOpen, dockList } from "../server/agent/tools/verbs/dock";

const CITY = "test-product-surface-ws";

function normQuest(out: any) {
  const e = out as any;
  return {
    ok: e.ok,
    title: e.data?.title ?? e.title,
    cityId: e.data?.cityId ?? e.cityId,
    events: (e.events ?? []).map((x: any) => x.type).sort(),
  };
}

describe("product surface: same input, same result, same events", () => {
  beforeEach(async () => {
    await fs.mkdir(path.resolve(process.cwd(), "workspace", CITY), { recursive: true }).catch(() => {});
  });

  afterEach(async () => {
    await fs.rm(path.resolve(process.cwd(), "workspace", CITY), { recursive: true, force: true }).catch(() => {});
  });

  it("plugins.operate: HTTP route, shared handler (CLI path) and verb tool agree", async () => {
    const input = { cityId: CITY, title: `Surface quest ${Date.now()}`, description: "equivalence", xpReward: 10 };
    const { app } = await import("../server/index");

    const httpRes = await app.request("/api/plugins/cities/quest_add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const httpOut = await httpRes.json();

    const sharedOut = await invokeCapability("cities", "quest_add", input, { actor: "cli", cityId: CITY });
    const toolOut = await pluginsOperate.execute(
      { plugin: "cities", capability: "quest_add", input, cityId: CITY } as any,
      { step: 1, cityId: CITY }
    );

    expect(httpRes.status).toBe(200);
    expect(normQuest(sharedOut)).toEqual(normQuest(httpOut));
    expect(normQuest(toolOut)).toEqual(normQuest(httpOut));
    expect((httpOut.events ?? []).length).toBeGreaterThanOrEqual(0);
  });

  it("dock.open / dock.list: facade route, shared handler and verb tools agree", async () => {
    const { dockRouter } = await import("../server/routes/dock");
    const probe = new Hono().route("/api/dock", dockRouter);

    const httpRes = await probe.request("/api/dock/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "scope.get", cityId: CITY }),
    });
    const httpOut = await httpRes.json();
    expect(httpRes.status).toBe(200);

    const sharedOut = await dockAction("scope.get", { cityId: CITY }, { actor: "cli" });
    const pick = (o: any) => ({ ok: o.ok, cityId: o.data?.cityId ?? o.data?.targetCity ?? null });
    expect(pick(sharedOut)).toEqual(pick(httpOut));

    const listOut: any = await dockList.execute({ cityId: CITY } as any, { step: 1, cityId: CITY });
    expect(listOut.ok).toBe(true);
    expect(Array.isArray(listOut.data.builtin)).toBe(true);

    const openOut: any = await dockOpen.execute({ tabId: "notes", cityId: CITY } as any, { step: 1, cityId: CITY });
    expect(openOut.ok).toBe(true);
  });

  it("agent.task: facade route and shared handler agree", async () => {
    const { agentRouter } = await import("../server/routes/agent");
    const probe = new Hono().route("/api/agent", agentRouter);
    const httpRes = await probe.request("/api/agent/tasks?status=running");
    const httpOut = await httpRes.json();

    const toolOut = await agentTask("list", { status: "running" });
    expect(httpRes.status).toBe(200);
    expect(httpOut.ok).toBe(true);
    expect(toolOut.ok).toBe(true);
    expect(Array.isArray((toolOut as any).data)).toBe(true);
    expect((httpOut.data ?? []).length).toBe(((toolOut as any).data ?? []).length);
  });

  it("no agent tool calls product routes directly (verb tools delegate in-process)", async () => {
    const dir = path.resolve("server/agent/tools");
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const bad: string[] = [];
    for (const f of files) {
      const src = await fs.readFile(path.join(dir, f), "utf-8");
      for (const line of src.split("\n")) {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
        if (/fetch\s*\(\s*[`'"]\/api\//.test(line)) bad.push(`${f}: ${t.slice(0, 80)}`);
        if (/localhost:3000|127\.0\.0\.1:3000/.test(line)) bad.push(`${f}: ${t.slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("verb tools only import the facade, sibling schemas, or zod", async () => {
    for (const f of ["server/agent/tools/verbs/dock.ts", "server/agent/tools/verbs/plugins.ts"]) {
      const src = await fs.readFile(path.resolve(f), "utf-8");
      const imports = [...src.matchAll(/^import .* from ["']([^"']+)["']/gm)].map((m) => m[1]);
      for (const imp of imports) {
        const ok =
          imp === "zod" ||
          imp === "../../types" ||
          imp === "../../../facade/shared";
        expect(ok, `${f} imports unexpected module ${imp}`).toBe(true);
      }
    }
  });
});
