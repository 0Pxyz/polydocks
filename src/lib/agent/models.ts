/**
 * Meta Model API Catalog & Metadata
 * Verified against dev.meta.ai/docs/models.
 * Only models the configured provider serves are listed. meta-llama/*
 * entries were removed: selecting them failed upstream (Meta Model API
 * serves muse-* only; Llama weights are self-hosted) and a judge
 * clicking them saw an error.
 */

export interface MetaModelSpec {
  id: string;
  name: string;
  shortName: string;
  badge: string;
  category: "agent" | "reasoning";
  description: string;
  contextWindow: string;
  features: string[];
  isDefault?: boolean;
}

export const META_MODELS: MetaModelSpec[] = [
  {
    id: "muse-spark-1.3",
    name: "Muse Spark 1.3",
    shortName: "Spark 1.3",
    badge: "⚡ Fast Agent",
    category: "agent",
    description: "Meta's flagship efficient model optimized for agent tool calling, dock synthesis, and interactive chat.",
    contextWindow: "1M tokens",
    features: ["Tool calling", "SSE streaming", "Dock synthesis", "1M context"],
    isDefault: true,
  },
  {
    id: "muse-wonder-1.0",
    name: "Muse Wonder 1.0",
    shortName: "Wonder 1.0",
    badge: "🧠 Deep Reasoning",
    category: "reasoning",
    description: "Deep reasoning model with reasoning effort controls for complex multi-paper comparisons and long-horizon planning.",
    contextWindow: "1M tokens",
    features: ["Deep CoT", "Multi-document analysis", "Complex synthesis", "1M context"],
  },
];

export const DEFAULT_MODEL_ID = "muse-spark-1.3";

export function getMetaModel(modelId: string): MetaModelSpec {
  return META_MODELS.find((m) => m.id === modelId) || META_MODELS[0];
}

/**
 * Reasoning effort levels for the Meta Model API (Chat Completions:
 * top-level `reasoning_effort`). Verified against dev.meta.ai/docs/reasoning.
 * Both muse-spark-1.3 and muse-wonder-1.0 are reasoning models; "none"
 * returns HTTP 400 on both, so it is not offered. "auto" omits the parameter
 * and leaves the depth to the model (preserves previous behavior).
 */
export const REASONING_EFFORTS = [
  "auto",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "auto";

export function isValidReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && (REASONING_EFFORTS as readonly string[]).includes(value);
}

/** True when the value must be sent as `reasoning_effort` ("auto" omits it). */
export function toApiReasoningEffort(value: unknown): string | undefined {
  if (!isValidReasoningEffort(value) || value === "auto") return undefined;
  return value;
}
