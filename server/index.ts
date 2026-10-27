import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { config } from "./config";
import { runAgentLoop, type AgentStepEvent } from "./agent/loop";

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

// Health check endpoint
app.get("/api/health", (c) => {
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
  });
});

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
  console.log(
    `[Polymax Server] Running on http://localhost:${config.PORT} (env: ${config.NODE_ENV})`
  );
}
