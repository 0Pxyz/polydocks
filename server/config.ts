import { z } from "zod";

const envSchema = z.object({
  MODEL_BASE_URL: z.string().url().default("https://api.meta.ai/v1"),
  MODEL_ID: z.string().default("muse-spark-1.3"),
  MODEL_API_KEY: z.string().optional().default(""),
  MODEL_REALTIME_URL: z.string().url().default("wss://api.meta.ai/v1/asr/realtime"),
  MODEL_VOICE_MODEL: z.string().default("muse-voice-transcribe-1.0"),
  // Role overrides. MODEL_ID stays the backwards-compatible default for the agent role.
  MODEL_AGENT_ID: z.string().optional().default(""),
  MODEL_FAST_ID: z.string().default("muse-spark-1.3"),
  MODEL_VISION_ID: z.string().optional().default(""),
  MODEL_IMAGE_ID: z.string().default("muse-image-1.0"),
  MODEL_SEGMENTATION_ID: z.string().default("sam-3.1"),
  // Open-weight toggle (Baseten / Modal / self-hosted OpenAI-compatible endpoint).
  // When AGENT_PROVIDER=openweight the agent role routes here instead of Meta.
  AGENT_PROVIDER: z.enum(["meta", "openweight"]).default("meta"),
  OPENWEIGHT_BASE_URL: z.string().optional().default(""),
  OPENWEIGHT_API_KEY: z.string().optional().default(""),
  OPENWEIGHT_MODEL_ID: z.string().default("meta-models/muse-spark-open-1026"),
  TINYFISH_API_KEY: z.string().optional().default(""),
  // Modal Sandboxes (agent code execution). The JS SDK reads MODAL_TOKEN_ID /
  // MODAL_TOKEN_SECRET from env, falling back to ~/.modal.toml (`modal setup`).
  // Unset means the sandbox provider is disabled and sandbox tools fail
  // closed with a setup hint; the rest of the app keeps working.
  MODAL_TOKEN_ID: z.string().optional().default(""),
  MODAL_TOKEN_SECRET: z.string().optional().default(""),
  // Product surface: three APIs (/api/plugins, /api/dock, /api/agent).
  // facade = also mounts the thin facade routers (old routes stay untouched).
  PRODUCT_SURFACE: z.enum(["legacy", "facade"]).default("facade"),
  // Agent tool surface: full = current catalog. minimal = verb tools only
  // (dock.open/close/pin/unpin/list, plugins.create/edit/install/uninstall/operate).
  AGENT_SURFACE: z.enum(["full", "minimal"]).default("full"),
  // Install policy for agent-originated plugin lifecycle (create/install/
  // publish): ask = needs { userApproved: true } (default), auto = proceed,
  // never = always deny. actor=user|cli means an explicit human action.
  INSTALL_POLICY: z.enum(["ask", "auto", "never"]).default("ask"),
  // Spending guard for generated images (covers, share cards, city art).
  // Counted per UTC day in SQLite (image_spend); requests beyond the cap
  // fail with budget_exceeded instead of spending.
  IMAGE_MAX_PER_DAY: z.coerce.number().int().min(0).default(25),
  PORT: z.coerce.number().int().positive().default(3000),
  DATA_DIR: z.string().default("./data"),
  AGENT_HOME_DIR: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`[FATAL] Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
