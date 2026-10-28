import { z } from "zod";

const envSchema = z.object({
  MODEL_BASE_URL: z.string().url().default("https://api.meta.ai/v1"),
  MODEL_ID: z.string().default("muse-spark-1.3"),
  MODEL_API_KEY: z.string().optional().default(""),
  TINYFISH_API_KEY: z.string().optional().default(""),
  MAX_STEPS: z.coerce.number().int().positive().default(20),
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
