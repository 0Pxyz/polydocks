import { describe, it, expect, beforeEach } from "bun:test";
import { capabilityBus } from "../server/plugins/bus";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party";
import { db } from "../server/workspace/db";

initializeFirstPartyPlugins();

const WS = "test-demo-data-ws";

const ITEM = {
  workspaceId: WS,
  url: "https://lilianweng.github.io/posts/2023-06-23-agent/",
  kind: "article",
  title: "LLM Powered Autonomous Agents",
  site: "lilianweng.github.io",
  hook: "The classic agent survey.",
  fullText: "# Demo summary\n\nSurvey of agent architectures.",
} as const;

function payload(res: any): any {
  return res?.data as any;
}

/**
 * Demo data capabilities: offline fixture import plus cleanup removes,
 * so the scripted onboarding never touches the network and leaves no
 * trace unless the user keeps the workspace. The bus reports handler
 * outcomes on data.ok (success only means the call executed).
 */
describe("demo data capabilities", () => {
  beforeEach(() => {
    db.query("DELETE FROM sources WHERE workspace_id = ?").run(WS);
    db.query("DELETE FROM notes WHERE workspace_id = ?").run(WS);
  });

  it("sources.import saves a full item with zero network", async () => {
    const res = await capabilityBus.invoke("sources.import", { ...ITEM }, { workspaceId: WS });
    expect(res.success).toBe(true);
    expect(payload(res)?.ok).toBe(true);
    expect(payload(res)?.data?.title).toBe(ITEM.title);
    expect(payload(res)?.data?.deduped).toBe(false);
    const listed: any = await capabilityBus.invoke("sources.list", { workspaceId: WS }, { workspaceId: WS });
    expect(payload(listed)?.data?.items?.length).toBe(1);
    expect(payload(listed)?.data?.items[0]?.hook).toBe(ITEM.hook);
  });

  it("sources.import dedupes by URL on replay", async () => {
    const first: any = await capabilityBus.invoke("sources.import", { ...ITEM }, { workspaceId: WS });
    const second: any = await capabilityBus.invoke("sources.import", { ...ITEM }, { workspaceId: WS });
    expect(payload(second)?.ok).toBe(true);
    expect(payload(second)?.data?.deduped).toBe(true);
    expect(payload(second)?.data?.id).toBe(payload(first)?.data?.id);
    const listed: any = await capabilityBus.invoke("sources.list", { workspaceId: WS }, { workspaceId: WS });
    expect(payload(listed)?.data?.items?.length).toBe(1);
  });

  it("sources.remove deletes by id and reports missing afterwards", async () => {
    const created: any = await capabilityBus.invoke("sources.import", { ...ITEM }, { workspaceId: WS });
    const id = payload(created)?.data?.id;
    const removed: any = await capabilityBus.invoke("sources.remove", { id, workspaceId: WS }, { workspaceId: WS });
    expect(payload(removed)?.ok).toBe(true);
    const again: any = await capabilityBus.invoke("sources.remove", { id, workspaceId: WS }, { workspaceId: WS });
    expect(payload(again)?.ok).toBe(false);
  });

  it("notes.remove deletes by id and stays workspace-scoped", async () => {
    const created: any = await capabilityBus.invoke(
      "notes.add",
      { workspaceId: WS, title: "Demo notes", body: "demo" },
      { workspaceId: WS }
    );
    expect(payload(created)?.ok).toBe(true);
    const id = payload(created)?.data?.id ?? payload(created)?.id;
    const foreign: any = await capabilityBus.invoke(
      "notes.remove",
      { id, workspaceId: "other-ws" },
      { workspaceId: "other-ws" }
    );
    expect(payload(foreign)?.ok).toBe(false);
    const removed: any = await capabilityBus.invoke(
      "notes.remove",
      { id, workspaceId: WS },
      { workspaceId: WS }
    );
    expect(payload(removed)?.ok).toBe(true);
    const listed: any = await capabilityBus.invoke("notes.list", { workspaceId: WS }, { workspaceId: WS });
    expect(payload(listed)?.data?.items?.length).toBe(0);
  });
});
