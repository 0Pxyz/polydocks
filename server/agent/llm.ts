import OpenAI from "openai";
import { config } from "../config";

/**
 * Meta Model API Client instance initialized via OpenAI SDK
 * Base URL: https://api.meta.ai/v1 (or open-weight provider endpoints)
 * Default Model: muse-spark-1.3
 */
export const llm = new OpenAI({
  baseURL: config.MODEL_BASE_URL,
  apiKey: config.MODEL_API_KEY || "dummy-meta-key-unconfigured",
});

export const MODEL_ID = config.MODEL_ID;
