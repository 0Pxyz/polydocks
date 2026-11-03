import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { runAgentLoop, type AgentStepEvent } from "../server/agent/loop";
import {
  shouldForwardBusEvent,
  shouldBridgeLoopEvent,
} from "../server/agent/loopEvents";
import {
  bridgeBackgroundLoopEvent,
  taskExecutionEngine,
} from "../server/agent/taskRunner";
import { capabilityBus } from "../server/plugins/bus";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party/index";
import { initAgentHome } from "../server/system/agentHome";
import { db } from "../server/workspace/db";
import type { AgentTool } from "../server/agent/tools/types";
import type { JobEventRow } from "../server/workspace/sessions";

const WS = "ws-realtime-sync";
const SESS = "sess-realtime-sync";

/**
 * Real-time sync bridge (#360): one transport carries every reactive UI
 * event from the loop to the durable SSE stream. Pins the three holes:
 * bus-side capability events forwarded (not just approvals), envelope
 * events announced (install path included), background parity with
 * interactive turns, and no tool.start/tool.done doubles.
 */
describe("realtime sync bridge (#360)", () => {
  let tmpDir: string;
  const originalEnv = process.env.AGENT_HOME_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "realtime-sync-test-"));
    process.env.AGENT_HOME_DIR = tmpDir;
    await initAgentHome(tmpDir);
    initializeFirstPartyPlugins();
  });

  afterEach(async () => {
    try {
      db.query("DELETE FROM job_events WHERE session_id = ?").run(SESS);
    } catch {}
    try {
      db.query("DELETE FROM notes WHERE workspace_id = ?").run(WS);
    } catch {}
    if (originalEnv !== undefined) process.env.AGENT_HOME_DIR = originalEnv;
    else delete process.env.AGENT_HOME_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    taskExecutionEngine.clearBuffers();
  });

  it("predicates: bus drops only exact duplicates, background skips only heartbeat/deltas", () => {
    expect(shouldForwardBusEvent("approval.requested")).toBe(true);
    expect(shouldForwardBusEvent("source.added")).toBe(true);
    expect(shouldForwardBusEvent("browser.open")).toBe(true);
    expect(shouldForwardBusEvent("tool.start")).toBe(false);
    expect(shouldForwardBusEvent("tool.done")).toBe(false);

    for (const t of ["tool.start", "tool.done", "plugin.created", "tray.open", "dock.layout", "browser.open", "source.added", "sandbox.preview", "theme.apply", "approval.requested"]) {
      expect(shouldBridgeLoopEvent(t)).toBe(true);
    }
    expect(shouldBridgeLoopEvent("agent.heartbeat")).toBe(false);
    expect(shouldBridgeLoopEvent("agent.text_delta")).toBe(false);
  });

  it("background bridge writes progress + side-effects durably, skips heartbeat/deltas", async () => {
    const live: JobEventRow[] = [];
    const unsub = taskExecutionEngine.subscribeJobs(SESS, (row) => live.push(row));
    const emitted: AgentStepEvent[] = [];
    const task = { id: "task-360-bridge", sessionId: SESS, type: "plugin_synthesis" };
    try {
      const feed = async (type: string, payload: Record<string, unknown> = {}) =>
        bridgeBackgroundLoopEvent(task, { step: 1, type, payload } as AgentStepEvent, async (ev) => {
          emitted.push(ev);
        }, (row) => taskExecutionEngine.announceRow(row));

      const started = await feed("tool.start", { name: "x" });
      expect(started.toolCall).toBe(true);
      const created = await feed("plugin.created", { pluginId: "p" });
      expect(created.pluginTouch).toBe(true);
      await feed("tray.open", {});
      await feed("source.added", {});
      await feed("agent.heartbeat", {});
      await feed("agent.text_delta", { delta: "hi" });

      const { listJobEvents } = await import("../server/workspace/sessions");
      const types = listJobEvents({ sessionId: SESS }).map((r) => r.type);
      for (const t of ["tool.start", "plugin.created", "tray.open", "source.added"]) {
        expect(types).toContain(t);
      }
      expect(types).not.toContain("agent.heartbeat");
      expect(types).not.toContain("agent.text_delta");
      // Live subscribers see the same rows (chat updates without reload).
      expect(live.map((r) => r.type)).toContain("tool.start");
      // In-memory emit still fires for legacy subscribers.
      expect(emitted.map((e) => e.type)).toContain("plugin.created");
    } finally {
      unsub();
    }
  });

  it("loop forwards bus capability events + envelope events with no tool doubles", async () => {
    const emitter: AgentTool<any> = {
      name: "test_emitter",
      description: "emits a bus event mid-run and returns envelope events",
      schema: z.object({}),
      execute: async (_args: any, ctx: any) => {
        await ctx.onEvent({ step: 1, type: "source.added", payload: { id: "src-1" } });
        return { success: true, events: [{ type: "test.envelope", payload: { ok: 1 } }] };
      },
    };
    const busBacked: AgentTool<any> = {
      name: "test_bus_backed",
      description: "invokes a real capability through the bus",
      schema: z.object({}),
      execute: async (_args: any, ctx: any) => {
        const res = await capabilityBus.invoke(
          "notes.list",
          { workspaceId: WS },
          { actor: "agent", workspaceId: WS, onEvent: ctx.onEvent }
        );
        return { success: res.success, count: 1 };
      },
    };
    const fakeInstaller: AgentTool<any> = {
      name: "install_plugin",
      description: "facade-style envelope with events",
      schema: z.object({}),
      execute: async () => ({
        ok: true,
        data: { pluginId: "store-thing" },
        events: [{ type: "plugin.installed", payload: { pluginId: "store-thing" } }],
      }),
    };

    const script: Record<string, any> = {
      test_emitter: {
        id: "call_1",
        type: "function",
        function: { name: "test_emitter", arguments: "{}" },
      },
      test_bus_backed: {
        id: "call_2",
        type: "function",
        function: { name: "test_bus_backed", arguments: "{}" },
      },
      install_plugin: {
        id: "call_3",
        type: "function",
        function: { name: "install_plugin", arguments: "{}" },
      },
    };
    const order = ["test_emitter", "test_bus_backed", "install_plugin"];
    let calls = 0;
    const mockLlm: any = {
      chat: {
        completions: {
          create: async () => {
            const name = order[calls++];
            if (!name) {
              return { choices: [{ message: { role: "assistant", content: "done" } }] };
            }
            return {
              choices: [
                { message: { role: "assistant", content: null, tool_calls: [script[name]] } },
              ],
            };
          },
        },
      },
    };

    const seen: AgentStepEvent[] = [];
    const result = await runAgentLoop({
      prompt: "bridge test",
      workspaceId: WS,
      sessionId: `${SESS}-loop`,
      tools: [emitter, busBacked, fakeInstaller] as any,
      llmClient: mockLlm,
      onEvent: (ev) => {
        seen.push(ev);
      },
    });
    expect(result.status).toBe("completed");

    const types = seen.map((e) => e.type);
    // Hole 1: bus-side capability events travel up (not just approvals).
    expect(types).toContain("source.added");
    // Hole 3: generic envelope events announce (install path included).
    expect(types).toContain("test.envelope");
    expect(types.filter((t) => t === "plugin.installed").length).toBe(1);
    // No doubles: one loop-owned start/done per call; the bus copies die.
    expect(types.filter((t) => t === "tool.start").length).toBe(3);
    expect(types.filter((t) => t === "tool.done").length).toBe(3);
    expect(types).not.toContain("notes.list");
    const busStarts = seen.filter(
      (e) => e.type === "tool.start" && String((e.payload as any)?.name || "") === "notes.list"
    );
    expect(busStarts.length).toBe(0);
  });
});
