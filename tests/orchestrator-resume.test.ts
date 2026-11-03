import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { recoverMessageQueue, ensureQueueTable } from "../server/agent/orchestrator";
import { listJobEvents } from "../server/workspace/sessions";
import { db } from "../server/workspace/db";

/**
 * Job resume across reloads/restart (#178 remainder).
 * Server already persists tasks + events; this pins the two gaps:
 * boot recovery speaks (message.error per interrupted turn) and the
 * front re-attaches (hydrateJobs seeds active cards + reopens the stream).
 */
describe("interrupted queue turns speak on recovery (#178)", () => {
  const SID = "sess-resume-probe";

  beforeEach(() => {
    ensureQueueTable();
    db.query("DELETE FROM job_events WHERE session_id = ?").run(SID);
    db.query("DELETE FROM message_queue WHERE session_id = ?").run(SID);
    const now = new Date().toISOString();
    for (const [id, status] of [["msg-stuck-1", "queued"], ["msg-stuck-2", "processing"], ["msg-done-1", "done"]] as const) {
      db.query(
        `INSERT INTO message_queue (id, session_id, workspace_id, prompt, origin, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, SID, "ws-resume", "probe", "chat", status, now, now);
    }
  });

  afterEach(() => {
    db.query("DELETE FROM job_events WHERE session_id = ?").run(SID);
    db.query("DELETE FROM message_queue WHERE session_id = ?").run(SID);
  });

  it("flips stuck rows and emits one resend error per interrupted turn", () => {
    const out = recoverMessageQueue();
    expect(out.recovered).toBe(2);

    const leftovers = db.query("SELECT COUNT(*) AS n FROM message_queue WHERE session_id = ? AND status IN ('queued','processing')").get(SID) as any;
    expect(leftovers.n).toBe(0);

    const errors = listJobEvents({ sessionId: SID }).filter((r) => r.type === "message.error");
    expect(errors.length).toBe(2);
    for (const row of errors) {
      const text = typeof row.payload?.text === "string" ? row.payload.text : "";
      expect(text).toContain("resend");
    }
    const ids = errors.map((r) => r.jobId).sort();
    expect(ids).toEqual(["msg-stuck-1", "msg-stuck-2"]);
  });

  it("is a no-op when nothing is stuck", () => {
    db.query("DELETE FROM message_queue WHERE session_id = ?").run(SID);
    db.query("DELETE FROM job_events WHERE session_id = ?").run(SID);
    expect(recoverMessageQueue().recovered).toBe(0);
    expect(listJobEvents({ sessionId: SID }).length).toBe(0);
  });
});
