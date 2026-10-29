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
import { mapsRouter } from "./routes/maps";
import { worldRouter } from "./routes/world";
import { pluginsRouter, capabilitiesRouter } from "./routes/plugins";
import { workspacesRouter } from "./routes/workspaces";
import { registryRouter } from "./routes/registry";
import { memoryRouter } from "./routes/memory";
import { threadRouter } from "./routes/thread";
import { resolveUserId } from "./identity";
import { sessionsRouter } from "./routes/sessions";
import { tasksRouter } from "./routes/tasks";
import { artifactsRouter } from "./routes/artifacts";
import { taskExecutionEngine } from "./agent/taskRunner";
import { recordExperienceError, getExperienceErrors } from "./workspace/experienceErrors";
import { initAgentHome } from "./system/agentHome";
import { db } from "./workspace/db";
import { isVoiceRealtimeRequest, voiceSessionIdFrom, voiceWebsocketHandlers } from "./voice/proxy";

// Bootstrap persistent agent-home filesystem structure on startup
await initAgentHome().catch((err) => {
  console.error("[Polymax Server] Failed to initialize agent-home:", err);
});

// Recover any interrupted background tasks from previous server instance
taskExecutionEngine.recoverInterruptedTasks();

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
    allowHeaders: ["Content-Type", "Authorization", "X-Polymax-User"],
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

// Mount Plugins and Capabilities router
app.route("/api/plugins", pluginsRouter);
app.route("/api/capabilities", capabilitiesRouter);

// Mount PolyDocks V2 Workspaces router
app.route("/api/workspaces", workspacesRouter);

// Mount PolyDocks V2 Community Plugin Registry router
app.route("/api/registry", registryRouter);

// Mount Cities & Workspaces router
app.route("/api/cities", citiesRouter);

// Mount Agent Durable Memory router
app.route("/api/agent/memory", memoryRouter);

// Mount the single persistent agent thread (transcript + bounded context)
app.route("/api/agent/thread", threadRouter);

// Mount Persistent Work Sessions & Background Task Engine (Issue #76)
app.route("/api/sessions", sessionsRouter);
app.route("/api/tasks", tasksRouter);
app.route("/api/artifacts", artifactsRouter);

// Mount World Maps & Cartography router (Maps v2)
app.route("/api/maps", mapsRouter);

// Mount Knowledge World router (cities + conceptual links for the particle map)
app.route("/api/world", worldRouter);

// Experience runtime error reporting endpoints
app.post("/api/experiences/:id/errors", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { cityId, error } = body;
  const recorded = recordExperienceError(id, cityId || "global", error || {});
  return c.json({ success: true, error: recorded });
});

app.get("/api/experiences/:id/errors", (c) => {
  const id = c.req.param("id");
  const cityId = c.req.query("cityId");
  const errors = getExperienceErrors(id, cityId);
  return c.json({ errors });
});

// SSE Streaming endpoint for agent tool-calling loop
app.post("/api/agent", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  const { prompt, cityId, history, origin, sessionId, workspaceId, taskId, modelId, model, reasoningEffort, attachments, retry } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return c.json({ error: "Missing required 'prompt' field in request body" }, 400);
  }

  const userId = resolveUserId({
    header: c.req.header("x-polymax-user"),
    body: body.userId,
  });

  const requestedModel =
    typeof modelId === "string" && modelId.trim().length > 0
      ? modelId.trim()
      : typeof model === "string" && model.trim().length > 0
      ? model.trim()
      : undefined;

  // Reasoning effort for the Meta Model API (Chat Completions: top-level
  // `reasoning_effort`). "auto"/absent omits the parameter; anything outside
  // the allowlist is dropped so a bad value can never reach the model call.
  const VALID_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];
  const requestedEffort =
    typeof reasoningEffort === "string" && VALID_EFFORTS.includes(reasoningEffort)
      ? reasoningEffort
      : undefined;

  return streamSSE(c, async (stream) => {
    await runAgentLoop({
      prompt: prompt.trim(),
      userId,
      cityId: typeof cityId === "string" ? cityId : undefined,
      sessionId: typeof sessionId === "string" ? sessionId : undefined,
      workspaceId: typeof workspaceId === "string" ? workspaceId : undefined,
      taskId: typeof taskId === "string" ? taskId : undefined,
      origin: origin === "dock-add" ? "dock-add" : "chat",
      modelId: requestedModel,
      reasoningEffort: requestedEffort,
      attachments: Array.isArray(attachments) ? attachments : undefined,
      history: Array.isArray(history) ? history : [],
      retryLast: retry === true,
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
  fetch(req: Request, server: any) {
    if (isVoiceRealtimeRequest(req)) {
      const sessionId = voiceSessionIdFrom(req);
      try {
        if (server?.upgrade?.(req, { data: { sessionId } })) return undefined as any;
      } catch {
        // Fall through to an explicit error below
      }
      return new Response("Voice realtime requires a WebSocket upgrade.", { status: 426 });
    }
    return app.fetch(req, server);
  },
  websocket: voiceWebsocketHandlers,
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
