import { describe, it, expect } from "bun:test";
import { GUEST_BRIDGE_SCRIPT } from "./guest-bridge";

interface GuestEnv {
  fakeWindow: any;
  listeners: Record<string, Array<(e: any) => void>>;
  posted: Array<{ msg: any; origin: string }>;
  polydocks: any;
}

/** Runs the guest bridge script against a fake window (no host replies). */
function makeGuestEnv(timeoutMs?: number, ackTimeoutMs?: number): GuestEnv {
  const listeners: Record<string, Array<(e: any) => void>> = {};
  const posted: Array<{ msg: any; origin: string }> = [];
  const fakeWindow: any = {
    addEventListener: (type: string, fn: (e: any) => void) => {
      (listeners[type] ||= []).push(fn);
    },
    parent: {
      postMessage: (msg: any, origin: string) => {
        posted.push({ msg, origin });
      },
    },
  };
  if (timeoutMs !== undefined) fakeWindow.__POLYDOCKS_BRIDGE_TIMEOUT_MS = timeoutMs;
  if (ackTimeoutMs !== undefined) fakeWindow.__POLYDOCKS_BRIDGE_ACK_TIMEOUT_MS = ackTimeoutMs;
  const run = new Function("window", `${GUEST_BRIDGE_SCRIPT}\nreturn window.polydocks;`);
  const polydocks = run(fakeWindow);
  return { fakeWindow, listeners, posted, polydocks };
}

/** Delivers a host reply to the guest's message listeners. */
function hostReply(env: GuestEnv, response: any) {
  for (const fn of env.listeners["message"] || []) {
    fn({ data: response });
  }
}

/**
 * Guest-side timeout regression tests.
 *
 * Before the fix, sendHostRequest created a promise with no timeout: when the
 * host bridge held a stale (null) target window, replies never came and every
 * storage/useCapability/openContent call hung forever with no error surfacing.
 */
describe("Guest bridge request timeouts (bridge-fix regression)", () => {
  it("rejects with a clear timeout error when the host never replies", async () => {
    const env = makeGuestEnv(50);
    const pending = env.polydocks.storage.get("gtm-feed:read");
    // Fail fast if the guest never settles (the old hang): race a watchdog.
    const watchdog = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("GUEST HUNG: no timeout rejection within 1000ms")), 1000)
    );
    const err = await Promise.race([pending.then(
      () => { throw new Error("expected rejection, got resolve"); },
      (e: unknown) => e as Error,
    ), watchdog]).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/timed out/i);
    expect(err.message).toContain("storage.get");
  });

  it("resolves normally when the host replies in time", async () => {
    const env = makeGuestEnv(1000);
    const pending = env.polydocks.storage.get("k");
    const request = env.posted.find((p) => p.msg.polydocksAction === "storage.get");
    expect(request).toBeDefined();
    hostReply(env, { polydocksResponseId: request!.msg.polydocksRequestId, result: "v" });
    await expect(pending).resolves.toBe("v");
  });

  it("reports 'bridge not responding' via runtime.error when the ready handshake gets no host ack", async () => {
    const env = makeGuestEnv(50, 50);
    expect(typeof env.polydocks.__signalReady).toBe("function");
    const acked = await env.polydocks.__signalReady();
    expect(acked).toBe(false);
    const errPost = env.posted.find((p) => p.msg.polydocksAction === "runtime.error");
    expect(errPost).toBeDefined();
    expect(JSON.stringify(errPost!.msg.error)).toMatch(/bridge not responding/i);
  });

  it("acks the ready handshake when the host replies (no error posted)", async () => {
    const env = makeGuestEnv(1000, 1000);
    const ready = env.polydocks.__signalReady();
    const request = env.posted.find((p) => p.msg.polydocksAction === "ui.ready");
    expect(request).toBeDefined();
    hostReply(env, { polydocksResponseId: request!.msg.polydocksRequestId, result: true });
    await expect(ready).resolves.toBe(true);
    expect(env.posted.some((p) => p.msg.polydocksAction === "runtime.error")).toBe(false);
  });

  it("keeps the ready marker the host scans for (requiresReady handshake detection)", () => {
    // DynamicPluginSandbox detects new builds by scanning the srcdoc text for
    // this exact literal; the handshake must keep emitting it.
    expect(GUEST_BRIDGE_SCRIPT).toContain('polydocksAction: "ui.ready"');
  });

  it("stays inline-safe for srcdoc embedding (no script-breaking sequences)", () => {
    expect(GUEST_BRIDGE_SCRIPT).not.toContain("</script");
    expect(GUEST_BRIDGE_SCRIPT).not.toContain("<!--");
  });
});
