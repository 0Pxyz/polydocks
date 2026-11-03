import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { withKeyLock } from "../server/sandbox/mutex";
import {
  getSandboxRecord,
  upsertSandboxRecord,
  clearSandboxRecord,
} from "../server/sandbox/store";
import { sweepWorkspaceDuplicates } from "../server/sandbox/modalProvider";

const WS = "ws-sandbox-hygiene";

/**
 * Sandbox proliferation guards (#308): concurrent ops for one workspace
 * serialize the ensure window; the store round-trips the single id; the
 * sweeper terminates same-workspace twins and keeps the stored one.
 */
describe("sandbox proliferation guards (#308)", () => {
  beforeEach(() => {
    try {
      clearSandboxRecord(WS);
    } catch {}
  });
  afterEach(() => {
    try {
      clearSandboxRecord(WS);
    } catch {}
  });

  it("serializes concurrent sections per key", async () => {
    const order: string[] = [];
    const slow = withKeyLock(WS, async () => {
      order.push("slow-enter");
      await new Promise((r) => setTimeout(r, 80));
      order.push("slow-exit");
      return "slow";
    });
    const fast = withKeyLock(WS, async () => {
      order.push("fast-enter");
      order.push("fast-exit");
      return "fast";
    });
    const [a, b] = await Promise.all([slow, fast]);
    expect(a).toBe("slow");
    expect(b).toBe("fast");
    // No interleaving: fast entered only after slow exited.
    expect(order).toEqual(["slow-enter", "slow-exit", "fast-enter", "fast-exit"]);
  });

  it("lets different workspaces proceed in parallel", async () => {
    const order: string[] = [];
    const one = withKeyLock(`${WS}-1`, async () => {
      order.push("one-enter");
      await new Promise((r) => setTimeout(r, 50));
      order.push("one-exit");
    });
    const two = withKeyLock(`${WS}-2`, async () => {
      order.push("two-enter");
      order.push("two-exit");
    });
    await Promise.all([one, two]);
    // two finished while one was still inside: keys do not block each other.
    expect(order.indexOf("two-exit")).toBeLessThan(order.indexOf("one-exit"));
  });

  it("round-trips the single workspace id and replaces stale records", () => {
    expect(getSandboxRecord(WS)).toBeNull();
    upsertSandboxRecord({ workspaceId: WS, sandboxId: "sb-old", name: "ws-x", volume: "vol-x" });
    expect(getSandboxRecord(WS)?.sandboxId).toBe("sb-old");
    upsertSandboxRecord({ workspaceId: WS, sandboxId: "sb-new", name: "ws-x", volume: "vol-x" });
    expect(getSandboxRecord(WS)?.sandboxId).toBe("sb-new");
  });

  it("sweeps same-workspace twins and keeps the stored id", async () => {
    const terminated: string[] = [];
    const running = (id: string) => ({
      sandboxId: id,
      poll: async () => null,
      terminate: async () => {
        terminated.push(id);
      },
    });
    const finished = (id: string) => ({
      sandboxId: id,
      poll: async () => 0,
      terminate: async () => {
        terminated.push(id);
      },
    });
    const modal = {
      sandboxes: {
        list: async function* () {
          yield running("sb-keep");
          yield running("sb-twin-1");
          yield finished("sb-dead");
          yield running("sb-twin-2");
        },
      },
    };
    const swept = await sweepWorkspaceDuplicates(modal, { appId: "app-1" }, "ws-x", "sb-keep");
    expect(swept).toBe(2);
    expect(terminated.sort()).toEqual(["sb-twin-1", "sb-twin-2"]);
  });

  it("sweep tolerates listing outages", async () => {
    const modal = {
      sandboxes: {
        list: async function* () {
          throw new Error("list down");
          yield;
        },
      },
    };
    const swept = await sweepWorkspaceDuplicates(modal, {}, "ws-x", "sb-keep");
    expect(swept).toBe(0);
  });
});
