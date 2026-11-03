import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../server/workspace/db";
import { wipeRunPrefix } from "./isolation-db";
import { sandbox_read_file } from "../server/agent/tools/sandbox";
import { inspect_execution } from "../server/agent/tools/inspect_execution";
import { list_recent_executions } from "../server/agent/tools/list_recent_executions";

const RUN = `tool-scope-${Date.now()}`;
const WS_A = `${RUN}-a`;
const WS_B = `${RUN}-b`;

function ctx(ws?: string): any {
  return { workspaceId: ws, step: 1, actor: "agent" as const };
}

/**
 * Agent-tool session scoping (Tarefa 1, item 2): the effective scope comes
 * from the authenticated session (tool ctx), never from a model-supplied
 * argument. Cross-scope requests fail instead of leaking.
 */
describe("agent tool session scope (#215)", () => {
  beforeAll(() => wipeRunPrefix(RUN));
  afterAll(() => wipeRunPrefix(RUN));

  it("sandbox tools deny a model arg outside the session scope", async () => {
    const denied: any = await sandbox_read_file.execute(
      { path: "x.txt", workspaceId: WS_B } as any,
      ctx(WS_A)
    );
    expect(denied.error).toBe("Not found");
    expect(denied.capabilityId).toBe("sandbox.read_file");

    // Same scope proceeds past the scope check (no Modal here: the
    // sandbox provider reports unavailable instead of scoping-denied).
    const same: any = await sandbox_read_file.execute(
      { path: "x.txt", workspaceId: WS_A } as any,
      ctx(WS_A)
    );
    expect(same.error ?? "").not.toBe("Not found");
  });

  it("inspect_execution only opens runs inside the session scope", async () => {
    const execId = `exec_${RUN}_1`;
    db.query(
      `INSERT INTO executions (execution_id, capability_id, plugin_id, actor, workspace_id, status, duration_ms, input_json, output_json, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(execId, "notes.add", "notes", "agent", WS_A, "success", 1, "{}", "{}", null, new Date().toISOString());

    const foreign: any = await inspect_execution.execute({ executionId: execId } as any, ctx(WS_B));
    expect(foreign.success).toBe(false);
    expect(foreign.error).toBe("Not found");

    const own: any = await inspect_execution.execute({ executionId: execId } as any, ctx(WS_A));
    expect(own.success).toBe(true);
    expect(own.execution.workspaceId).toBe(WS_A);

    const missing: any = await inspect_execution.execute({ executionId: `exec_${RUN}_nope` } as any, ctx(WS_B));
    expect(missing.success).toBe(false);
  });

  it("list_recent_executions is pinned to the session scope", async () => {
    const now = new Date().toISOString();
    for (const [id, ws] of [[`${RUN}-e1`, WS_A], [`${RUN}-e2`, WS_B]] as const) {
      db.query(
        `INSERT INTO executions (execution_id, capability_id, plugin_id, actor, workspace_id, status, duration_ms, input_json, output_json, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(`exec_${id}`, "notes.list", "notes", "agent", ws, "success", 1, "{}", "{}", null, now);
    }

    const cross: any = await list_recent_executions.execute({ workspaceId: WS_B } as any, ctx(WS_A));
    expect(cross.success).toBe(false);
    expect(cross.error).toBe("Not found");

    const own: any = await list_recent_executions.execute({} as any, ctx(WS_A));
    expect(own.success).toBe(true);
    const ids = (own.executions as any[]).map((e) => e.executionId);
    expect(ids).toContain(`exec_${RUN}-e1`);
    expect(ids).not.toContain(`exec_${RUN}-e2`);
  });
});
