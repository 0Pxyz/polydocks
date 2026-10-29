/**
 * Meta Model API Catalog & Metadata
 * Verified against dev.meta.ai/docs/api-reference
 */

export interface MetaModelSpec {
  id: string;
  name: string;
  shortName: string;
  badge: string;
  category: "agent" | "reasoning" | "vision" | "knowledge";
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
  {
    id: "meta-llama/Llama-3.2-11B-Vision-Instruct",
    name: "Llama 3.2 Vision",
    shortName: "Llama 3.2 Vision",
    badge: "👁 Multimodal",
    category: "vision",
    description: "Multimodal vision model for visual understanding, whiteboard OCR, charts, diagrams, and photos.",
    contextWindow: "128K tokens",
    features: ["Photo analysis", "Diagram inspection", "Whiteboard OCR", "Document QA"],
  },
  {
    id: "meta-llama/Llama-3.3-70B-Instruct",
    name: "Llama 3.3 70B",
    shortName: "Llama 3.3",
    badge: "📚 Knowledge",
    category: "knowledge",
    description: "High-capability open-weight model specialized in Socratic dialogue, philosophy, and pedagogy.",
    contextWindow: "128K tokens",
    features: ["Socratic pedagogy", "Broad domain mastery", "Philosophical dialogue"],
  },
];

export const DEFAULT_MODEL_ID = "muse-spark-1.3";

export function getMetaModel(modelId: string): MetaModelSpec {
  return META_MODELS.find((m) => m.id === modelId) || META_MODELS[0];
}

export type ReasoningEffortId = "auto" | "low" | "medium" | "high";

export interface ReasoningEffortSpec {
  id: ReasoningEffortId;
  label: string;
  description: string;
}

export const REASONING_EFFORTS: ReasoningEffortSpec[] = [
  { id: "auto", label: "Automático", description: "Modelos Muse" },
  { id: "low", label: "Baixo", description: "Rápido e eficiente" },
  { id: "medium", label: "Médio", description: "Profundidade equilibrada" },
  { id: "high", label: "Alto", description: "Muito minucioso" },
];

export const DEFAULT_EFFORT_ID: ReasoningEffortId = "auto";

export function getEffort(effortId: string): ReasoningEffortSpec {
  return REASONING_EFFORTS.find((e) => e.id === effortId) || REASONING_EFFORTS[0];
}
