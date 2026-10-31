import { describe, expect, it } from "bun:test";
import app from "../server/index";
import { isLoopbackHost } from "../server/config";
import { DEFAULT_USER_ID, resolveUserIdForMode } from "../server/identity";

/**
 * DEPLOY_MODE local guard (#191 slice 1, ADR 0002 demo-week allowed).
 * Local stays single-user with a fixed owner; health reports the mode;
 * a non-loopback HOST is refused in local mode.
 */
describe("deploy mode local guard (#191)", () => {
  it("defaults to local mode and reports it from /api/health", async () => {
    const res = await app.fetch(new Request("http://localhost:3000/api/health"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("ok");
    expect(data.mode).toBe("local");
  });

  it("resolves every local request to the fixed owner", () => {
    expect(
      resolveUserIdForMode({ header: "mallory", query: "eve", body: "trudy" }, "local")
    ).toBe(DEFAULT_USER_ID);
    expect(resolveUserIdForMode({}, "local")).toBe(DEFAULT_USER_ID);
  });

  it("keeps caller resolution in cloud mode (fork-only)", () => {
    expect(resolveUserIdForMode({ header: "alice" }, "cloud")).toBe("alice");
    expect(resolveUserIdForMode({ query: "bob" }, "cloud")).toBe("bob");
    expect(resolveUserIdForMode({}, "cloud")).toBe(DEFAULT_USER_ID);
  });

  it("accepts loopback hosts and rejects the rest", () => {
    for (const host of ["", "localhost", "127.0.0.1", "::1", "  LOCALHOST  "]) {
      expect(isLoopbackHost(host)).toBe(true);
    }
    for (const host of ["0.0.0.0", "::", "192.168.1.10", "example.com"]) {
      expect(isLoopbackHost(host)).toBe(false);
    }
  });
});
