import OpenAI from "openai";
import { config } from "../config";

export type ModelRole = "agent" | "fast" | "vision" | "voice" | "image" | "segmentation";
export type ModelProvider = "meta" | "openai-compatible";

export interface ResolvedModel {
  role: ModelRole;
  provider: ModelProvider;
  baseURL: string;
  apiKey: string;
  modelId: string;
  /** True when the deployment has credentials for this role. */
  configured: boolean;
}

export interface ModelError {
  ok: false;
  error: { code: string; message: string; retryable: boolean; role: ModelRole };
}

function metaKey(): string {
  // config is parsed at import; fall back to the live env so tests that
  // set MODEL_API_KEY after import (hermetic fetch mocks) still resolve.
  // In prod both agree (bun loads .env into process.env before import).
  return config.MODEL_API_KEY?.trim() || process.env.MODEL_API_KEY?.trim() || "";
}

/**
 * Resolve which model serves a role, purely from env.
 * No plugin calls this with a provider: plugins declare a role,
 * the registry decides the provider. Swapping AGENT_PROVIDER
 * never changes the plugin catalog.
 *
 * Truth table (verified against dev.meta.ai/docs/models):
 * - agent: MODEL_AGENT_ID || MODEL_ID (default muse-spark-1.3).
 *   AGENT_PROVIDER=openweight routes to OPENWEIGHT_* (default
 *   meta-models/muse-spark-open-1026 on Baseten).
 * - fast: MODEL_FAST_ID (default muse-spark-1.3, cheap/low-latency work).
 * - vision: MODEL_VISION_ID override, else the agent model. Spark and
 *   Wonder take image input natively, so no separate vision model is
 *   required unless a deployment pins one.
 * - voice: MODEL_VOICE_MODEL (default muse-voice-transcribe-1.0),
 *   served over wss MODEL_REALTIME_URL or POST /v1/asr/transcribe.
 * - image: MODEL_IMAGE_ID (default muse-image-1.0),
 *   POST /v1/images/generations|edits.
 * - segmentation: MODEL_SEGMENTATION_ID (default sam-3.1),
 *   POST /v1/responses. Service exists; agent tool stays unwired
 *   until the golden path is stable.
 */
export function getModelForRole(role: ModelRole): ResolvedModel {
  switch (role) {
    case "voice":
      return {
        role,
        provider: "meta",
        baseURL: config.MODEL_BASE_URL,
        apiKey: metaKey(),
        modelId: config.MODEL_VOICE_MODEL,
        configured: metaKey().length > 0,
      };
    case "image":
      return {
        role,
        provider: "meta",
        baseURL: config.MODEL_BASE_URL,
        apiKey: metaKey(),
        modelId: config.MODEL_IMAGE_ID,
        configured: metaKey().length > 0,
      };
    case "segmentation":
      return {
        role,
        provider: "meta",
        baseURL: config.MODEL_BASE_URL,
        apiKey: metaKey(),
        modelId: config.MODEL_SEGMENTATION_ID,
        configured: metaKey().length > 0,
      };
    case "fast": {
      return {
        role,
        provider: "meta",
        baseURL: config.MODEL_BASE_URL,
        apiKey: metaKey(),
        modelId: config.MODEL_FAST_ID || config.MODEL_ID,
        configured: metaKey().length > 0,
      };
    }
    case "vision": {
      const override = config.MODEL_VISION_ID?.trim();
      const modelId = override && override.length > 0 ? override : config.MODEL_ID;
      return {
        role,
        provider: "meta",
        baseURL: config.MODEL_BASE_URL,
        apiKey: metaKey(),
        modelId,
        configured: metaKey().length > 0,
      };
    }
    case "agent":
    default: {
      if (config.AGENT_PROVIDER === "openweight") {
        const key = config.OPENWEIGHT_API_KEY?.trim() ?? "";
        return {
          role: "agent",
          provider: "openai-compatible",
          baseURL: config.OPENWEIGHT_BASE_URL,
          apiKey: key,
          modelId: config.OPENWEIGHT_MODEL_ID,
          configured: key.length > 0 && config.OPENWEIGHT_BASE_URL.length > 0,
        };
      }
      const override = config.MODEL_AGENT_ID?.trim();
      return {
        role: "agent",
        provider: "meta",
        baseURL: config.MODEL_BASE_URL,
        apiKey: metaKey(),
        modelId: override && override.length > 0 ? override : config.MODEL_ID,
        configured: metaKey().length > 0,
      };
    }
  }
}

export function modelError(
  role: ModelRole,
  code: string,
  message: string,
  retryable = false
): ModelError {
  return { ok: false, error: { code, message, retryable, role } };
}

/**
 * OpenAI-compatible adapter. Meta Model API is OpenAI-compatible and
 * Baseten/Modal expose OpenAI-compatible surfaces, so one adapter
 * covers both providers with different baseURL/apiKey.
 */
export function getClientForRole(role: ModelRole): { client: OpenAI; modelId: string } {
  const resolved = getModelForRole(role);
  const client = new OpenAI({
    baseURL: resolved.baseURL,
    apiKey: resolved.apiKey || "dummy-meta-key-unconfigured",
  });
  return { client, modelId: resolved.modelId };
}

/** Backwards-compatible default: the agent-role client. */
export function getAgentClient(): { client: OpenAI; modelId: string } {
  return getClientForRole("agent");
}
