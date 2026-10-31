import { describe, expect, test } from "bun:test";
import { app } from "../server/index";
import {
  browserStreamIdentity,
  isBrowserStreamRequest,
} from "../server/browser/relay";

describe("native browser surface (Atrium, first-party)", () => {
  test("health reports configuration without leaking the secret", async () => {
    const res = await app.request("/api/browser/atrium/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(typeof body.configured).toBe("boolean");
    expect(JSON.stringify(body)).not.toContain("dev-secret");
  });

  test("session creation degrades gracefully or returns a live session", async () => {
    // Without ATRIUM_WORKER_SECRET the surface must fail closed (Reader
    // fallback) instead of dialing anywhere. With a worker configured,
    // POST {} creates a session without needing the worker (no bootstrap).
    const res = await app.request("/api/browser/atrium/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 503) {
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe("browser_unavailable");
      return;
    }
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      sessionId?: string;
      viewerToken?: string;
      wsUrl?: string;
    };
    expect(typeof body.sessionId).toBe("string");
    expect(typeof body.viewerToken).toBe("string");
    expect(typeof body.wsUrl).toBe("string");
    // Cleanup: same (anonymous) principal owns the session.
    const del = await app.request(
      `/api/browser/atrium/sessions/${encodeURIComponent(body.sessionId!)}`,
      { method: "DELETE" }
    );
    expect(del.status).toBe(204);
  });

  test("stream upgrade routing parses session identity", () => {
    const good = new Request(
      "http://localhost:3000/api/browser/atrium/sessions/abc123/stream?token=t_v123",
      { headers: { upgrade: "websocket" } }
    );
    expect(isBrowserStreamRequest(good)).toBe(true);
    expect(browserStreamIdentity(good)).toEqual({ sessionId: "abc123", token: "t_v123" });

    const noUpgrade = new Request("http://localhost:3000/api/browser/atrium/sessions/abc/stream");
    expect(isBrowserStreamRequest(noUpgrade)).toBe(false);

    const other = new Request("http://localhost:3000/api/voice/realtime", {
      headers: { upgrade: "websocket" },
    });
    expect(isBrowserStreamRequest(other)).toBe(false);
    expect(browserStreamIdentity(other)).toBeNull();
  });
});
