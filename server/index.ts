import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { runAgentLoop, type AgentStepEvent } from "./agent/loop";
import { pluginsRouter, capabilitiesRouter } from "./routes/plugins";
import { workspacesRouter } from "./routes/workspaces";
import { registryRouter } from "./routes/registry";
import { memoryRouter } from "./routes/memory";
import { threadRouter } from "./routes/thread";
import { readerRouter } from "./reader/route";
import { resolveUserId } from "./identity";
import { sessionsRouter } from "./routes/sessions";
import { tasksRouter } from "./routes/tasks";
import { artifactsRouter } from "./routes/artifacts";
import { taskExecutionEngine } from "./agent/taskRunner";
import { recordExperienceError, getExperienceErrors } from "./workspace/experienceErrors";
import { initAgentHome } from "./system/agentHome";
import { db } from "./workspace/db";
import { isVoiceRealtimeRequest, voiceSessionIdFrom, voiceWebsocketHandlers } from "./voice/proxy";
import { browserRouter } from "./browser/route";
import {
  browserStreamIdentity,
  browserWebsocketHandlers,
  isBrowserStreamRequest,
} from "./browser/relay";

// Bootstrap persistent agent-home filesystem structure on startup
await initAgentHome().catch((err) => {
  console.error("[Polymax Server] Failed to initialize agent-home:", err);
});

// One-time idempotent import of workspace plugin files into SQLite
// (plugin_files is the source of truth; workspace/ is ephemeral in prod).
// Skipped under bun test: migration is a production boot concern and would
// import mid-run fixture files into the shared test database.
if (config.NODE_ENV !== "test") {
  try {
    const { migrateWorkspacePluginFiles } = await import("./workspace/pluginFiles");
    const report = await migrateWorkspacePluginFiles();
    if (report.imported > 0 || report.conflicts.length > 0) {
      console.log(
        `[Polymax Server] Plugin migration: ${report.imported} imported, ${report.skipped} skipped, ${report.conflicts.length} conflicts`
      );
      for (const c of report.conflicts.slice(0, 10)) {
        console.log(`[Polymax Server] Plugin migration conflict: ${c.workspaceId}/${c.pluginId} kept ${c.kept}`);
      }
    }
  } catch (err) {
    console.error("[Polymax Server] Plugin migration failed (non-fatal):", err);
  }
  // Reversible backfills (no destructive DDL): plugin version rows mirrored
  // into plugin_files.
  try {
    const { backfillPluginVersionsToFiles } = await import("./plugins/versions");
    const { copied } = backfillPluginVersionsToFiles();
    if (copied > 0) {
      console.log(`[Polymax Server] Plugin versions backfill: ${copied} rows mirrored into plugin_files.`);
    }
  } catch (err) {
    console.error("[Polymax Server] Plugin versions backfill failed (non-fatal):", err);
  }
}

// Recover any interrupted background tasks from previous server instance
taskExecutionEngine.recoverInterruptedTasks();

const app = new Hono();

// Exported for facade-equivalence tests (app.request, no server needed).
export { app };

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

// Mount Plugins and Capabilities router
app.route("/api/plugins", pluginsRouter);
app.route("/api/capabilities", capabilitiesRouter);

// Mount PolyDocks V2 Workspaces router
app.route("/api/workspaces", workspacesRouter);

// Mount PolyDocks V2 Community Plugin Registry router
app.route("/api/registry", registryRouter);

// Mount Agent Durable Memory router
app.route("/api/agent/memory", memoryRouter);

// Mount the single persistent agent thread (transcript + bounded context)
app.route("/api/agent/thread", threadRouter);

// Native Reader backend (SSRF-guarded article/video loader)
app.route("/api/reader", readerRouter);

// Native remote browser (Atrium worker + viewer relay, first-party service)
app.route("/api/browser/atrium", browserRouter);

// Mount Persistent Work Sessions & Background Task Engine (Issue #76)
app.route("/api/sessions", sessionsRouter);
app.route("/api/tasks", tasksRouter);
app.route("/api/artifacts", artifactsRouter);

// Product surface facade (PRODUCT_SURFACE=facade): thin routers over the
// same handlers. Legacy routes above stay untouched in both modes.
if (config.PRODUCT_SURFACE === "facade") {
  const { dockRouter } = await import("./routes/dock");
  const { agentRouter } = await import("./routes/agent");
  app.route("/api/dock", dockRouter);
  app.route("/api/agent", agentRouter);
  // Same routers, same handlers, product paths.
  app.route("/api/agent/sessions", sessionsRouter);
  app.route("/api/agent/tasks", tasksRouter);
}

// Experience runtime error reporting endpoints
app.post("/api/experiences/:id/errors", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { workspaceId, error } = body;
  const recorded = recordExperienceError(id, workspaceId || "global", error || {});
  return c.json({ success: true, error: recorded });
});

app.get("/api/experiences/:id/errors", (c) => {
  const id = c.req.param("id");
  const workspaceId = c.req.query("workspaceId");
  const errors = getExperienceErrors(id, workspaceId);
  return c.json({ errors });
});

// Share card: generated milestone backdrop (client renders city/XP/streak
// text on top so stats stay exact). Daily image budget applies.
app.post("/api/share-card", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON request body" }, 400);
  }
  try {
    const { requestShareCard } = await import("./media/shareCard");
    const result = await requestShareCard(body ?? {});
    if (!result.ok) {
      const status = result.code === "budget_exceeded" ? 429 : 400;
      return c.json({ success: false, error: result.error, code: result.code }, status as any);
    }
    return c.json({ success: true, data: { url: result.url, model: result.model, cached: result.cached ?? false } });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Share card failed" }, 500);
  }
});

// Generated image cache (Muse Image covers / city art / share cards).
// Strict filename allowlist: <32-hex>.<ext> only, no traversal.
app.get("/api/media/image-cache/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (!/^[a-f0-9]{32}\.(webp|png|jpeg|jpg)$/.test(filename)) {
    return c.json({ error: "Unknown media file." }, 404);
  }
  try {
    const absPath = path.resolve(config.DATA_DIR, "image-cache", filename);
    const root = path.resolve(config.DATA_DIR, "image-cache");
    if (path.relative(root, absPath).startsWith("..")) {
      return c.json({ error: "Unknown media file." }, 404);
    }
    const file = Bun.file(absPath);
    if (!(await file.exists())) return c.json({ error: "Unknown media file." }, 404);
    const type = filename.endsWith(".png") ? "image/png" : filename.endsWith(".jpg") || filename.endsWith(".jpeg") ? "image/jpeg" : "image/webp";
    return new Response(file as any, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
  } catch {
    return c.json({ error: "Unknown media file." }, 404);
  }
});

// SSE Streaming endpoint for agent tool-calling loop
app.post("/api/agent", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  const { prompt, workspaceId, history, origin, sessionId, taskId, modelId, model, reasoningEffort, attachments, retry } = body;

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
      workspaceId: typeof workspaceId === "string" ? workspaceId : undefined,
      sessionId: typeof sessionId === "string" ? sessionId : undefined,
      taskId: typeof taskId === "string" ? taskId : undefined,
      origin: origin === "dock-add" ? "dock-add" : "chat",
      modelId: requestedModel,
      reasoningEffort: requestedEffort,
      attachments: Array.isArray(attachments) ? attachments : undefined,
      history: Array.isArray(history) ? history : [],
      retryLast: retry === true,
      // Client disconnect (Stop button) aborts the model call and the
      // tool loop; runAgentLoop rolls the turn back for retry.
      signal: c.req.raw.signal,
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
    if (isBrowserStreamRequest(req)) {
      const identity = browserStreamIdentity(req);
      try {
        if (
          identity &&
          server?.upgrade?.(req, {
            data: { kind: "browser", sessionId: identity.sessionId, token: identity.token },
          })
        )
          return undefined as any;
      } catch {
        // Fall through to an explicit error below
      }
      return new Response("Browser stream requires a WebSocket upgrade.", { status: 426 });
    }
    return app.fetch(req, server);
  },
  websocket: {
    open(client: any) {
      if ((client?.data as any)?.kind === "browser") {
        browserWebsocketHandlers.open(client);
        return;
      }
      voiceWebsocketHandlers.open(client);
    },
    message(client: any, message: any) {
      if ((client?.data as any)?.kind === "browser") {
        browserWebsocketHandlers.message(client, message);
        return;
      }
      voiceWebsocketHandlers.message(client, message);
    },
    close(client: any, code?: number, reason?: string) {
      if ((client?.data as any)?.kind === "browser") {
        browserWebsocketHandlers.close(client);
        return;
      }
      (voiceWebsocketHandlers as any).close?.(client, code, reason);
    },
  },
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
