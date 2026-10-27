import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { runAgentLoop, type AgentStepEvent } from "./agent/loop";
import { mcpRouter } from "./api/mcp";
import { citiesRouter } from "./routes/cities";
import { db } from "./workspace/db";

const app = new Hono();

// CORS middleware for development
app.use(
  "/api/*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:3000",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Agentic Discovery: /.well-known/llms.txt and /.well-known/llms-full.txt
app.get("/.well-known/llms.txt", async (c) => {
  try {
    const filePath = path.resolve(process.cwd(), "public/.well-known/llms.txt");
    const content = await fs.readFile(filePath, "utf-8");
    c.header("Content-Type", "text/markdown; charset=utf-8");
    return c.body(content);
  } catch {
    return c.text("# Polymax\nAgentic Dock knowledge game and workspace.", 200, {
      "Content-Type": "text/markdown",
    });
  }
});

app.get("/.well-known/llms-full.txt", async (c) => {
  try {
    const filePath = path.resolve(process.cwd(), "docs/architecture.md");
    const content = await fs.readFile(filePath, "utf-8");
    c.header("Content-Type", "text/markdown; charset=utf-8");
    return c.body(content);
  } catch {
    return c.text("# Polymax Full Specification", 200);
  }
});

// Health check endpoint
app.get("/api/health", (c) => {
  let sqliteOk = false;
  try {
    const test = db.query("SELECT 1 as alive;").get() as any;
    sqliteOk = test?.alive === 1;
  } catch {
    sqliteOk = false;
  }

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: config.NODE_ENV,
    model: {
      id: config.MODEL_ID,
      configured: Boolean(config.MODEL_API_KEY && config.MODEL_API_KEY.trim().length > 0),
    },
    tinyfish: {
      configured: Boolean(config.TINYFISH_API_KEY && config.TINYFISH_API_KEY.trim().length > 0),
    },
    sqlite: {
      ok: sqliteOk,
    },
  });
});

// Mount Model Context Protocol (MCP) router
app.route("/api/mcp", mcpRouter);

// Mount Cities & Workspaces router
app.route("/api/cities", citiesRouter);

// SSE Streaming endpoint for agent tool-calling loop
app.post("/api/agent", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  const { prompt, cityId, history } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return c.json({ error: "Missing required 'prompt' field in request body" }, 400);
  }

  return streamSSE(c, async (stream) => {
    await runAgentLoop({
      prompt: prompt.trim(),
      cityId: typeof cityId === "string" ? cityId : undefined,
      history: Array.isArray(history) ? history : [],
      onEvent: async (event: AgentStepEvent) => {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      },
    });
  });
});

// Production static assets and SPA fallback
if (config.NODE_ENV === "production" || process.env.SERVE_STATIC === "true") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

export default {
  port: config.PORT,
  fetch: app.fetch,
};

if (import.meta.main) {
  if (
    !config.MODEL_API_KEY ||
    config.MODEL_API_KEY.trim().length === 0 ||
    config.MODEL_API_KEY === "dummy-meta-key-unconfigured" ||
    config.MODEL_API_KEY.includes("placeholder")
  ) {
    console.warn(
      "[Polymax Server] Warning: MODEL_API_KEY is not configured or uses a placeholder. Upstream agent calls will return model_unauthorized."
    );
  }

  console.log(
    `[Polymax Server] Running on http://localhost:${config.PORT} (env: ${config.NODE_ENV})`
  );
}
