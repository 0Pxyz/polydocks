import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { KeywordRouter, resolveOpenRequest } from "../server/agent/orchestrator";
import { findAliasMentions } from "../server/agent/dispatcher";
import { db } from "../server/workspace/db";
import type { JobEventRow } from "../server/workspace/sessions";

const WS = "ws-dock-alias";

function router() {
  return new KeywordRouter();
}

function state(dockIds: string[] = ["agent", "browser", "plugins", "creations", "store", "settings"]) {
  return { workspaceId: WS, sessionId: "s1", dockIds, activeTasks: [] };
}

/**
 * Dock denial + alias contract (#345): sources phrasings resolve to the
 * Browser surface instead of the false-negative denial; free-form opens
 * work; conflicts escalate to the model; true unknowns keep a scrubbed
 * denial that names the id without misleading install advice.
 */
describe("dock alias resolution (#345)", () => {
  afterEach(() => {
    try {
      db.query("DELETE FROM message_queue WHERE workspace_id = ?").run(WS);
    } catch {}
  });

  it("maps every sources phrasing to the browser id", () => {
    expect(findAliasMentions("sources feed").map((m) => m.id)).toEqual(["browser"]);
    expect(findAliasMentions("feed").map((m) => m.id)).toEqual(["browser"]);
    expect(findAliasMentions("sources view").map((m) => m.id)).toEqual(["browser"]);
    expect(findAliasMentions("sources").map((m) => m.id)).toEqual(["browser"]);
  });

  it("routes deterministic sources opens to the browser", () => {
    for (const prompt of ["open sources feed", "open this tab Sources feed", "abre o feed", "open feed"]) {
      const d = router().route(prompt, state());
      expect(d.kind).toBe("dock_action");
      if (d.kind === "dock_action") {
        expect(d.args.dockOp).toBe("open");
        expect(d.args.dockId).toBe("browser");
      }
    }
  });

  it("routes free-form opens anywhere in the sentence", () => {
    const d = router().route("hey open the feed", state());
    expect(d.kind).toBe("dock_action");
    if (d.kind === "dock_action") {
      expect(d.args).toEqual({ dockOp: "open", dockId: "browser" });
    }
  });

  it("escalates conflicting targets to the model instead of guessing", () => {
    const d = router().route("hey open the browser settings", state());
    expect(d.kind).toBe("answer_quick");
  });

  it("ignores alias words without an open verb", () => {
    const d = router().route("the feed is broken", state());
    expect(d.kind).toBe("answer_quick");
  });

  it("resolves phrases to catalog targets", async () => {
    const browser = await resolveOpenRequest("sources feed", WS);
    expect(browser.status).toBe("resolved");
    if (browser.status === "resolved") expect(browser.id).toBe("browser");

    const unknown = await resolveOpenRequest("zzz-nao-existe", WS);
    expect(unknown.status).toBe("unknown");
  });

  it("end to end: sources feed opens the browser, unknown keeps scrubbed denial", async () => {
    const { queueMessage, setRouter, KeywordRouter } = await import("../server/agent/orchestrator");
    const { taskExecutionEngine } = await import("../server/agent/taskRunner");
    setRouter(new KeywordRouter());
    const sessionIds: string[] = [];

    async function waitForTerminal(sessionId: string, messageId: string): Promise<JobEventRow[]> {
      const seen: JobEventRow[] = [];
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out waiting for terminal message event")), 8000);
        const unsub = taskExecutionEngine.subscribeJobs(sessionId, (row) => {
          if (row.jobId === messageId) {
            seen.push(row);
            if (row.type === "message.done" || row.type === "message.error") {
              clearTimeout(timer);
              unsub();
              resolve();
            }
          }
        });
      });
      return seen;
    }

    try {
      const open = queueMessage({ workspaceId: WS, prompt: "open sources feed" });
      sessionIds.push(open.sessionId);
      const rows = await waitForTerminal(open.sessionId, open.messageId);
      const done = rows.at(-1)!;
      expect(done.type).toBe("message.done");
      expect((done.payload as any)?.action).toEqual({ op: "open", id: "browser" });

      const nope = queueMessage({ workspaceId: WS, sessionId: open.sessionId, prompt: "abre o zzz-nao-existe" });
      const rows2 = await waitForTerminal(open.sessionId, nope.messageId);
      const err = rows2.at(-1)!;
      expect(err.type).toBe("message.error");
      expect(String((err.payload as any)?.text)).toContain("zzz-nao-existe");
      expect(String((err.payload as any)?.text)).not.toContain("Install it from the Library first");
    } finally {
      taskExecutionEngine.clearBuffers();
      setRouter(new KeywordRouter());
      for (const sid of sessionIds.splice(0)) {
        try { db.query("DELETE FROM job_events WHERE session_id = ?").run(sid); } catch {}
        try { db.query("DELETE FROM message_queue WHERE session_id = ?").run(sid); } catch {}
        try { db.query("DELETE FROM tasks WHERE session_id = ?").run(sid); } catch {}
        try { db.query("DELETE FROM sessions WHERE id = ?").run(sid); } catch {}
      }
      try { db.query("DELETE FROM sessions WHERE workspace_id = ?").run(WS); } catch {}
    }
  });
});
