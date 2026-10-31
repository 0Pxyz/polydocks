import { describe, expect, it } from "bun:test";
import app from "../index";

describe("Polymax REST API Endpoints", () => {
  it("GET /api/health returns system and model status with latency < 5ms", async () => {
    const start = Date.now();
    const res = await app.fetch(new Request("http://localhost:3000/api/health"));
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("ok");
    expect(data.sqlite.ok).toBe(true);
    expect(duration).toBeLessThanOrEqual(50);
  });

  it("GET /api/workspaces lists workspaces", async () => {
    const res = await app.fetch(new Request("http://localhost:3000/api/workspaces"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("unknown routes return 404, not a legacy fallback", async () => {
    const res = await app.fetch(new Request("http://localhost:3000/api/cities"));
    expect(res.status).toBe(404);
  });
});
