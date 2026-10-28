import { describe, it, expect, beforeEach } from "bun:test";
import { META_MODELS, DEFAULT_MODEL_ID, getMetaModel } from "../src/lib/agent/models";
import { useConversationStore } from "../src/lib/agent/conversationStore";
import { platformStorage } from "../src/lib/platform/storage";

describe("Meta Models & Model Switcher (Issue #100)", () => {
  beforeEach(() => {
    platformStorage.clear();
    useConversationStore.setState({ selectedModel: DEFAULT_MODEL_ID });
  });

  describe("1. Meta Model API Catalog", () => {
    it("contains the standard Meta Model suite without contributor variants", () => {
      const ids = META_MODELS.map((m) => m.id);
      expect(ids).toContain("muse-spark-1.3");
      expect(ids).toContain("muse-wonder-1.0");
      expect(ids).toContain("meta-llama/Llama-3.2-11B-Vision-Instruct");
      expect(ids).toContain("meta-llama/Llama-3.3-70B-Instruct");

      // Verify no contributor variants exist
      for (const m of META_MODELS) {
        expect(m.id.includes("-contributor")).toBe(false);
      }
    });

    it("has muse-spark-1.3 as the default model", () => {
      expect(DEFAULT_MODEL_ID).toBe("muse-spark-1.3");
      const defaultModel = META_MODELS.find((m) => m.isDefault);
      expect(defaultModel?.id).toBe("muse-spark-1.3");
    });

    it("correctly retrieves a model by ID with fallback to default", () => {
      const wonder = getMetaModel("muse-wonder-1.0");
      expect(wonder.name).toBe("Muse Wonder 1.0");
      expect(wonder.category).toBe("reasoning");

      const vision = getMetaModel("meta-llama/Llama-3.2-11B-Vision-Instruct");
      expect(vision.name).toBe("Llama 3.2 Vision");
      expect(vision.category).toBe("vision");

      const fallback = getMetaModel("non-existent-model");
      expect(fallback.id).toBe(DEFAULT_MODEL_ID);
    });
  });

  describe("2. Conversation Store Model Selection & Persistence", () => {
    it("initializes with default model", () => {
      expect(useConversationStore.getState().selectedModel).toBe("muse-spark-1.3");
    });

    it("persists model change to platformStorage and state", () => {
      useConversationStore.getState().setSelectedModel("muse-wonder-1.0");
      expect(useConversationStore.getState().selectedModel).toBe("muse-wonder-1.0");
      expect(platformStorage.getItem("polymax-agent-model")).toBe("muse-wonder-1.0");

      useConversationStore.getState().setSelectedModel("meta-llama/Llama-3.2-11B-Vision-Instruct");
      expect(useConversationStore.getState().selectedModel).toBe("meta-llama/Llama-3.2-11B-Vision-Instruct");
      expect(platformStorage.getItem("polymax-agent-model")).toBe("meta-llama/Llama-3.2-11B-Vision-Instruct");
    });
  });
});
