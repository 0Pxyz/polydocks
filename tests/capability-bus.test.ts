import { describe, it, expect, beforeEach } from "bun:test";
import { z } from "zod";
import app from "../server/index";
import { capabilityBus } from "../server/plugins/bus";
import { pluginRegistry } from "../server/plugins/registry";
import { db } from "../server/workspace/db";

describe("Capability Bus, Execution Logging & Unified Catalog", () => {
  beforeEach(() => {
    capabilityBus.unregister("test-bus.echo");
    capabilityBus.unregister("test-bus.slow");
    db.query("DELETE FROM executions WHERE capability_id LIKE 'test-bus.%'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'test-bus%'").run();
  });

  describe("Capability Registration & Typed Invocation", () => {
    it("registers a capability and executes it successfully via the bus", async () => {
      // 1. Install synthetic plugin
      pluginRegistry.install({
        apiVersion: 1,
        id: "test-bus-plugin",
        name: "Test Bus Plugin",
        version: "1.0.0",
        description: "Testing capability bus",
        icon: "Sparkle",
        trust: "first-party",
        capabilities: [
          {
            id: "test-bus.echo",
            title: "Echo Input",
            description: "Echoes received message",
            input: z.object({ message: z.string().min(1) }),
            risk: "read",
          },
        ],
      });

      // 2. Register executable handler
      capabilityBus.register(
        "test-bus-plugin",
        {
          id: "test-bus.echo",
          title: "Echo Input",
          description: "Echoes received message",
          input: z.object({ message: z.string().min(1) }),
          risk: "read",
        },
        async (input) => {
          return { echoed: input.message.toUpperCase() };
        }
      );

      // 3. Track emitted SSE events
      const emittedEvents: Array<{ type: string; payload: any }> = [];
      const res = await capabilityBus.invoke<{ echoed: string }>(
        "test-bus.echo",
        { message: "hello polymax" },
        {
          actor: "agent",
          workspaceId: "stoicism",
          onEvent: (evt) => {
            emittedEvents.push(evt);
          },
        }
      );

      expect(res.success).toBe(true);
      expect(res.data?.echoed).toBe("HELLO POLYMAX");
      expect(res.durationMs).toBeGreaterThanOrEqual(0);

      // Verify emitted SSE events
      expect(emittedEvents.length).toBe(2);
      expect(emittedEvents[0].type).toBe("tool.start");
      expect(emittedEvents[0].payload.pluginId).toBe("test-bus-plugin");
      expect(emittedEvents[1].type).toBe("tool.done");
      expect(emittedEvents[1].payload.result).toEqual({ echoed: "HELLO POLYMAX" });

      // Verify SQLite execution record
      const row = db
        .query<{ status: string; actor: string; output_json: string }, [string]>(
          "SELECT status, actor, output_json FROM executions WHERE execution_id = ?"
        )
        .get(res.executionId);

      expect(row).not.toBeNull();
      expect(row?.status).toBe("success");
      expect(row?.actor).toBe("agent");
      expect(JSON.parse(row?.output_json || "{}")).toEqual({ echoed: "HELLO POLYMAX" });
    });

    it("fails gracefully and logs error on invalid input schema", async () => {
      capabilityBus.register(
        "test-bus-plugin",
        {
          id: "test-bus.echo",
          title: "Echo Input",
          description: "Echoes received message",
          input: z.object({ message: z.string().min(3) }),
          risk: "read",
        },
        async (input) => ({ ok: true, msg: input.message })
      );

      const res = await capabilityBus.invoke(
        "test-bus.echo",
        { message: "a" }, // Too short, fails schema
        { actor: "user" }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("Input validation error");

      // Verify SQLite row recorded failed status
      const row = db
        .query<{ status: string; error: string }, [string]>(
          "SELECT status, error FROM executions WHERE execution_id = ?"
        )
        .get(res.executionId);

      expect(row?.status).toBe("failed");
      expect(row?.error).toContain("Input validation error");
    });

    it("denies invocation when parent plugin is disabled", async () => {
      pluginRegistry.install({
        apiVersion: 1,
        id: "test-bus-disabled",
        name: "Disabled Plugin",
        version: "1.0.0",
        description: "Disabled plugin test",
        icon: "Sparkle",
        trust: "first-party",
        capabilities: [
          {
            id: "test-bus.echo",
            title: "Echo Input",
            description: "Echoes received message",
            input: z.object({ message: z.string() }),
            risk: "read",
          },
        ],
      });

      capabilityBus.register(
        "test-bus-disabled",
        {
          id: "test-bus.echo",
          title: "Echo",
          description: "Echo",
          input: z.object({ message: z.string() }),
          risk: "read",
        },
        async () => ({ ok: true })
      );

      // Disable plugin
      pluginRegistry.disable("test-bus-disabled");

      const res = await capabilityBus.invoke("test-bus.echo", { message: "hi" }, { actor: "user" });
      expect(res.success).toBe(false);
      expect(res.error).toContain("currently disabled");
    });

    it("handles execution timeout and abort signals", async () => {
      capabilityBus.register(
        "test-bus-plugin",
        {
          id: "test-bus.slow",
          title: "Slow capability",
          description: "Sleeps longer than timeout",
          input: z.object({}),
          risk: "read",
        },
        async (_input, ctx) => {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve({ done: true }), 500);
            ctx.signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new Error("Execution timed out"));
            });
          });
        }
      );

      const res = await capabilityBus.invoke("test-bus.slow", {}, { actor: "agent", timeoutMs: 25 });
      expect(res.success).toBe(false);
      expect(res.error).toContain("timed out");
    });
  });

  describe("REST API Endpoints & Unified Catalog", () => {
    it("serves GET /api/capabilities and GET /api/plugins", async () => {
      // Test GET /api/plugins
      const pluginRes = await app.fetch(new Request("http://localhost:3000/api/plugins"));
      expect(pluginRes.status).toBe(200);
      const pluginData = (await pluginRes.json()) as any;
      expect(Array.isArray(pluginData.plugins)).toBe(true);

      // Test GET /api/capabilities
      const capRes = await app.fetch(new Request("http://localhost:3000/api/capabilities"));
      expect(capRes.status).toBe(200);
      const capData = (await capRes.json()) as any;
      expect(Array.isArray(capData.capabilities)).toBe(true);
    });

    it("retired /api/mcp endpoint stays gone", async () => {
      const res = await app.fetch(
        new Request("http://localhost:3000/api/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 10, method: "tools/list" }),
        })
      );
      expect(res.status).toBe(404);
    });
  });
});
