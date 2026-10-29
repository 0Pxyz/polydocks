import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getCityContext,
  readCityFile,
  writeCityFile,
  resolveSafeCityPath,
} from "../workspace/cityWorkspace";
import { listFeatures, readFeature } from "../workspace/features";
import { generateCityFeed } from "../discovery/feedGenerator";
import { db } from "../workspace/db";
import { listSources } from "../plugins/sources";
import { buildCityWorkspace } from "../city-builder/pipeline";
import { TinyFishClient } from "../discovery/tinyfish";
import {
  getCityConversationMessages,
  appendCityMessage,
  clearCityConversation,
} from "../workspace/conversations";

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
 * Helper to recursively list files inside a city workspace
 */
async function listAllCityFiles(
  cityRoot: string,
  subDir = ""
): Promise<Array<{ path: string; name: string; size: number }>> {
  const currentDir = path.join(cityRoot, subDir);
  const items: Array<{ path: string; name: string; size: number }> = [];
  try {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const relPath = subDir ? `${subDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const nested = await listAllCityFiles(cityRoot, relPath);
        items.push(...nested);
      } else if (entry.isFile()) {
        const stat = await fs.stat(path.join(currentDir, entry.name));
        items.push({
          path: relPath,
          name: entry.name,
          size: stat.size,
        });
      }
    }
  } catch {
    // Directory unreadable
  }
  return items;
}

/**
 * GET /api/cities/:id/files - Lists all files inside city workspace
 */
citiesRouter.get("/:id/files", async (c) => {
  const cityId = c.req.param("id");
  try {
    const cityRoot = await resolveSafeCityPath(cityId, ".");
    const files = await listAllCityFiles(cityRoot);
    return c.json({ success: true, count: files.length, files });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * POST /api/cities/:id/files - Writes or creates a file inside city workspace
 */
citiesRouter.post("/:id/files", async (c) => {
  const cityId = c.req.param("id");
  try {
    const body = await c.req.json();
    const filePath = String(body.path || body.name || "untitled.md").trim();
    const content = String(body.content ?? "");
    await writeCityFile(cityId, filePath, content);
    return c.json({ success: true, path: filePath });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/cities/:id/context - Retrieves full city workspace context
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
 * GET /api/cities/:id/sources - Enriched source feed from the sources table.
 * This is the feed UI's source of truth: one enriched row per URL, saved
 * via sources.add (agent passes the URL, server enriches and validates).
 * Legacy shapes (sources/* filenames, raw feed.json items) are NOT read.
 */
citiesRouter.get("/:id/sources", async (c) => {
  const cityId = c.req.param("id");
  try {
    const items = listSources(cityId);
    return c.json({ success: true, data: items });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to load sources" }, 500);
  }
});
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
 * GET /api/cities/:id/tabs - Lists installed dock tabs and features in city
 */
citiesRouter.get("/:id/tabs", async (c) => {
  const cityId = c.req.param("id");
  try {
    const tabs = await listFeatures(cityId);
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
    const feat = await readFeature(cityId, tabId);
    c.header("Content-Type", "text/html; charset=utf-8");
    return c.body(feat.srcdoc);
  } catch {
    return c.text("Dynamic tab not found", 404);
  }
});

/**
 * GET /api/cities/:id/features/:tabId - Retrieves raw feature module data and manifest
 */
citiesRouter.get("/:id/features/:tabId", async (c) => {
  const cityId = c.req.param("id");
  const tabId = c.req.param("tabId");
  try {
    const feat = await readFeature(cityId, tabId);
    return c.json({ success: true, data: feat });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 404);
  }
});

/**
 * GET /api/cities/:id/build/stream - Streams live progress of city workspace synthesis
 */
citiesRouter.get("/:id/build/stream", async (c) => {
  const cityId = c.req.param("id");
  const topic = c.req.query("topic") || cityId.replace(/-/g, " ");
  const depth = (c.req.query("depth") as "overview" | "deep" | "mastery") || "deep";

  return streamSSE(c, async (stream) => {
    const tinyfish = new TinyFishClient();
    try {
      await buildCityWorkspace({
        cityId,
        topic,
        depth,
        tinyfish,
        emitEvent: async (ev) => {
          await stream.writeSSE({
            event: ev.type,
            data: JSON.stringify(ev),
          });
        },
      });
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({ success: true, cityId }),
      });
    } catch (err: any) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: err.message || String(err) }),
      });
    }
  });
});

/**
 * GET /api/cities/:id/conversation - Get persistent conversation history for city
 */
citiesRouter.get("/:id/conversation", (c) => {
  const cityId = c.req.param("id");
  const limit = Math.min(Number.parseInt(c.req.query("limit") || "50", 10), 100);
  const messages = getCityConversationMessages(cityId, limit);
  return c.json({ success: true, cityId, count: messages.length, messages });
});

/**
 * POST /api/cities/:id/conversation - Append a message to city conversation
 */
citiesRouter.post("/:id/conversation", async (c) => {
  const cityId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { role, content, toolCalls, toolCallId } = body;
  if (!role || !content) {
    return c.json({ error: "Missing required role and content fields" }, 400);
  }

  const msg = appendCityMessage(cityId, role, content, { toolCalls, toolCallId });
  return c.json({ success: true, message: msg }, 201);
});

/**
 * DELETE /api/cities/:id/conversation - Clear conversation history for city
 */
citiesRouter.delete("/:id/conversation", (c) => {
  const cityId = c.req.param("id");
  const ok = clearCityConversation(cityId);
  return c.json({ success: ok, cityId });
});
