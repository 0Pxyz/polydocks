import { describe, it, expect, afterAll } from "bun:test";
import { db } from "../server/workspace/db";
import { isModalConfigured } from "../server/sandbox/modalProvider";
import { sandboxNameFor, volumeNameFor, getSandboxRecord } from "../server/sandbox/store";
import { sandboxPath } from "../server/sandbox/index";

const WS_A = "test-166-vertical";
const WS_B = "test-166-isolation";

function cleanWorkspace(workspaceId: string) {
  db.query("DELETE FROM workspace_sandboxes WHERE workspace_id = ?").run(workspaceId);
}

describe("Issue #166 — Modal sandbox slices (no mocks, real provider)", () => {
  it("sandbox paths refuse escapes and absolutes", () => {
    expect(sandboxPath("/etc/passwd")).toBeNull();
    expect(sandboxPath("../../etc/passwd")).toBeNull();
    expect(sandboxPath("a/../../b")).toBeNull();
    expect(sandboxPath("")).toBeNull();
    expect(sandboxPath("app/server.js")).toBe("/repo/app/server.js");
    expect(sandboxPath("./notes.md")).toBe("/repo/notes.md");
  });

  it("workspace resource names are Modal-safe and stable", () => {
    expect(sandboxNameFor("default")).toBe("ws-default");
    expect(sandboxNameFor("City: São Paulo!")).toMatch(/^ws-[a-z0-9-]+$/);
    expect(volumeNameFor("default")).toBe("polydocks-ws-default");
    expect(sandboxNameFor("x").length).toBeLessThanOrEqual(64);
    expect(sandboxNameFor("default")).toBe(sandboxNameFor("default"));
  });

  it("mutating capabilities fail closed without approval (no Modal touched)", async () => {
    const { initializeFirstPartyPlugins } = await import("../server/plugins/first-party/index");
    initializeFirstPartyPlugins();
    const { capabilityBus } = await import("../server/plugins/bus");
    const res = await capabilityBus.invoke("sandbox.exec", { command: "echo hi", workspaceId: WS_A }, { actor: "agent", cityId: WS_A });
    expect(res.success).toBe(true); // bus call itself succeeded
    const envelope = res.data as any;
    expect(envelope?.ok).toBe(false); // capability envelope denies
    expect(String(envelope?.error || "")).toMatch(/ask|approv/i);
    expect(envelope?.code).toBe("approval_required");
    // No sandbox was created as a side effect.
    expect(getSandboxRecord(WS_A)).toBeNull();
  });

  it("conversational turns need no sandbox", async () => {
    const { runAgentLoop } = await import("../server/agent/loop");
    let sawSystem = "";
    const mockLlm: any = {
      chat: { completions: { create: async (params: any) => {
        sawSystem = params.messages.find((m: any) => m.role === "system")?.content || "";
        return { choices: [{ message: { role: "assistant", content: "Hello!" } }] };
      } } },
    };
    const res = await runAgentLoop({ prompt: "hello", llmClient: mockLlm });
    expect(res.status).toBe("completed");
    expect(getSandboxRecord("default")).toBeNull();
    expect(sawSystem.length).toBeGreaterThan(0);
  });
});

const live = isModalConfigured() ? describe : describe.skipIf(true);

live("Issue #166 — live Modal vertical slice (real sandboxes, billed)", () => {
  afterAll(async () => {
    const { sandboxTerminate } = await import("../server/sandbox/index");
    await sandboxTerminate(WS_A).catch(() => null);
    await sandboxTerminate(WS_B).catch(() => null);
    cleanWorkspace(WS_A);
    cleanWorkspace(WS_B);
  });

  it("agent creates a file and runs a command in its workspace sandbox", async () => {
    const { sandboxWriteFile, sandboxExec, sandboxReadFile } = await import("../server/sandbox/index");
    const written = await sandboxWriteFile(WS_A, "hello.js", "console.log('polydocks-live-' + (40 + 2));");
    expect(written.ok).toBe(true);
    const ran = await sandboxExec(WS_A, "node hello.js", { timeoutMs: 60_000 });
    expect(ran.ok).toBe(true);
    expect((ran.data as any)?.exitCode).toBe(0);
    expect(String((ran.data as any)?.stdout || "")).toContain("polydocks-live-42");
    const back = await sandboxReadFile(WS_A, "hello.js");
    expect(back.ok).toBe(true);
    expect(String((back.data as any)?.content || "")).toContain("polydocks-live");
  }, 180_000);

  it("nonzero exit is an honest failure receipt, stderr included", async () => {
    const { sandboxExec } = await import("../server/sandbox/index");
    const ran = await sandboxExec(WS_A, "node -e \"process.stderr.write('boom'); process.exit(3)\"", { timeoutMs: 60_000 });
    expect(ran.ok).toBe(false);
    expect((ran as any).code).toBe("nonzero_exit");
    expect(String((ran.data as any)?.stderr || "")).toContain("boom");
  }, 120_000);

  it("starts an app and returns a usable preview URL", async () => {
    const { sandboxWriteFile, sandboxServe, sandboxLogs, sandboxStatusInfo } = await import("../server/sandbox/index");
    const serverJs = `const http = require('http');
http.createServer((req, res) => { res.writeHead(200, {'Content-Type': 'text/plain'}); res.end('polydocks-preview-ok'); }).listen(3000);`;
    expect((await sandboxWriteFile(WS_A, "server.js", serverJs)).ok).toBe(true);
    const served = await sandboxServe(WS_A, "node server.js", { port: 3000, timeoutMs: 45_000 });
    expect(served.ok).toBe(true);
    const url = String((served.data as any)?.previewUrl || "");
    expect(url).toMatch(/^https:\/\/.+/);

    // The preview URL serves the app for real.
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("polydocks-preview-ok");

    // Logs and status are observable.
    const logs = await sandboxLogs(WS_A, { port: 3000 });
    expect(logs.ok).toBe(true);
    const status = await sandboxStatusInfo(WS_A);
    expect(status.ok).toBe(true);
    expect((status.data as any)?.state).toBe("running");
  }, 240_000);

  it("workspaces are isolated from each other", async () => {
    const { sandboxListFiles } = await import("../server/sandbox/index");
    const listed = await sandboxListFiles(WS_B, ".");
    expect(listed.ok).toBe(true);
    const names = ((listed.data as any)?.entries || []).map((e: any) => e.name);
    expect(names).not.toContain("hello.js");
    expect(names).not.toContain("server.js");
  }, 180_000);

  it("files survive sandbox replacement", async () => {
    const { sandboxTerminate, sandboxReadFile, sandboxWriteFile, sandboxStatusInfo } = await import("../server/sandbox/index");
    // Self-sufficient: ensure the file and a live sandbox first.
    expect((await sandboxWriteFile(WS_A, "hello.js", "console.log('polydocks-live-' + (40 + 2));")).ok).toBe(true);
    const before = await sandboxStatusInfo(WS_A);
    const oldId = String((before.data as any)?.sandboxId || "");
    expect(oldId.length).toBeGreaterThan(0);
    expect((await sandboxTerminate(WS_A)).ok).toBe(true);
    // Recreate on the same volume: the file must still be there.
    const back = await sandboxReadFile(WS_A, "hello.js");
    expect(back.ok).toBe(true);
    expect(String((back.data as any)?.content || "")).toContain("polydocks-live");
    const after = await sandboxStatusInfo(WS_A);
    expect(String((after.data as any)?.sandboxId || "")).not.toBe(oldId);
  }, 240_000);
});
