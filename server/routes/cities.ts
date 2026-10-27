import { Hono } from "hono";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getCityContext,
  readCityFile,
} from "../workspace/cityWorkspace";
import { generateCityFeed } from "../discovery/feedGenerator";
import { db } from "../workspace/db";

export const citiesRouter = new Hono();

/**
 * GET /api/cities - Lists all discovered cities and workspaces
 */
citiesRouter.get("/", async (c) => {
  const workspaceRoot = path.resolve(process.cwd(), "workspace");
  try {
    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    const cityIds = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);

    // Join with SQLite cities table for rich metadata
    const sqlCities = db
      .query("SELECT id, title, region, level, tags FROM cities")
      .all() as Array<{ id: string; title: string; region: string; level: number; tags: string }>;

    const cityMap = new Map(sqlCities.map((item) => [item.id, item]));

    const result = cityIds.map((id) => {
      const fromSql = cityMap.get(id);
      return {
        id,
        title: fromSql?.title || id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        region: fromSql?.region || "Core Region",
        level: fromSql?.level || 1,
        tags: fromSql?.tags ? JSON.parse(fromSql.tags) : [],
      };
    });

    return c.json({ success: true, count: result.length, data: result });
  } catch {
    return c.json({ success: true, count: 0, data: [] });
  }
});

/**
 * GET /api/cities/:id - Retrieves full city workspace context
 */
citiesRouter.get("/:id", async (c) => {
  const cityId = c.req.param("id");
  try {
    const context = await getCityContext(cityId);
    return c.json({ success: true, data: context });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Failed to load city" }, 404);
  }
});

/**
 * GET /api/cities/:id/feed - Retrieves the curated research feed
 */
citiesRouter.get("/:id/feed", async (c) => {
  const cityId = c.req.param("id");
  try {
    const raw = await readCityFile(cityId, "feed.json");
    return c.json({ success: true, data: JSON.parse(raw) });
  } catch {
    // If not generated yet, generate deterministically from city topic
    try {
      const topic = cityId.replace(/-/g, " ");
      const feed = await generateCityFeed(cityId, topic);
      return c.json({ success: true, data: feed });
    } catch (err: any) {
      return c.json({ success: false, error: err.message || "Failed to generate feed" }, 500);
    }
  }
});

/**
 * POST /api/cities/:id/feed/refresh - Triggers automated research feed generation
 */
citiesRouter.post("/:id/feed/refresh", async (c) => {
  const cityId = c.req.param("id");
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // Optional body
  }

  const topic = body?.topic || cityId.replace(/-/g, " ");
  try {
    const feed = await generateCityFeed(cityId, topic);
    return c.json({ success: true, data: feed });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Feed refresh failed" }, 500);
  }
});

/**
 * GET /api/cities/:id/tabs - Lists installed dock tabs in city
 */
citiesRouter.get("/:id/tabs", async (c) => {
  const cityId = c.req.param("id");
  try {
    const context = await getCityContext(cityId);
    const tabs: any[] = [];

    for (const tabId of context.tabs) {
      try {
        const manifestRaw = await readCityFile(cityId, `tabs/${tabId}/manifest.json`);
        tabs.push(JSON.parse(manifestRaw));
      } catch {
        tabs.push({ id: tabId, title: tabId, kind: "dynamic" });
      }
    }

    return c.json({ success: true, count: tabs.length, data: tabs });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/cities/:id/tabs/:tabId/srcdoc - Serves sandboxed HTML payload
 */
citiesRouter.get("/:id/tabs/:tabId/srcdoc", async (c) => {
  const cityId = c.req.param("id");
  const tabId = c.req.param("tabId");
  try {
    const html = await readCityFile(cityId, `tabs/${tabId}/index.html`);
    c.header("Content-Type", "text/html; charset=utf-8");
    return c.body(html);
  } catch {
    return c.text("Dynamic tab not found", 404);
  }
});
