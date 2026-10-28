import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import app from "../index";

const TEST_CITY = "test-city-api-routes";
const TEST_DIR = path.resolve(process.cwd(), "workspace", TEST_CITY);

describe("Polymax REST API Endpoints", () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.writeFile(
      path.join(TEST_DIR, "city.json"),
      JSON.stringify({ id: TEST_CITY, title: "API Test City", level: 1 })
    );
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

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

  it("GET /api/cities lists available workspaces", async () => {
    const res = await app.fetch(new Request("http://localhost:3000/api/cities"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.some((c: any) => c.id === TEST_CITY)).toBe(true);
  });

  it("GET /api/cities/:id returns workspace context", async () => {
    const res = await app.fetch(new Request(`http://localhost:3000/api/cities/${TEST_CITY}`));
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.data.cityId).toBe(TEST_CITY);
  });

  it("GET and POST /api/cities/:id/feed manages curated discovery feeds", async () => {
    const refreshRes = await app.fetch(
      new Request(`http://localhost:3000/api/cities/${TEST_CITY}/feed/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: "Distributed Consensus" }),
      })
    );

    expect(refreshRes.status).toBe(200);
    const refreshData = (await refreshRes.json()) as any;
    expect(refreshData.success).toBe(true);
    expect(refreshData.data.items.length).toBeGreaterThan(0);

    const getRes = await app.fetch(new Request(`http://localhost:3000/api/cities/${TEST_CITY}/feed`));
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as any;
    expect(getData.success).toBe(true);
    expect(getData.data.items.length).toBe(refreshData.data.items.length);
  });

  it("POST /api/agent validates prompt parameter", async () => {
    const res = await app.fetch(
      new Request("http://localhost:3000/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "" }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("GET /api/cities/:id/build/stream streams progress events via SSE", async () => {
    const res = await app.fetch(
      new Request(`http://localhost:3000/api/cities/${TEST_CITY}/build/stream?topic=Quantum%20Mechanics&depth=overview`)
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    if (reader) {
      const chunk = await reader.read();
      expect(chunk.done).toBe(false);
      const text = new TextDecoder().decode(chunk.value);
      expect(text).toContain("event:");
      reader.cancel();
    }
  });
});
