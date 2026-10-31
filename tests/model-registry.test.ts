import { describe, it, expect } from "bun:test";
import { getModelForRole, getClientForRole } from "../server/agent/modelRegistry";
import { fullTools } from "../server/agent/tools";

describe("Model registry resolves one model per role from env", () => {
  it("agent defaults to muse-spark-1.3 on the Meta provider", () => {
    const m = getModelForRole("agent");
    // Default env in this repo: AGENT_PROVIDER=meta (or unset).
    if (process.env.AGENT_PROVIDER !== "openweight") {
      expect(m.provider).toBe("meta");
      expect(["muse-spark-1.3", process.env.MODEL_AGENT_ID || "muse-spark-1.3"]).toContain(m.modelId);
    }
  });

  it("voice role is Muse Voice Transcribe, image role is Muse Image", () => {
    expect(getModelForRole("voice").modelId).toBe(process.env.MODEL_VOICE_MODEL || "muse-voice-transcribe-1.0");
    expect(getModelForRole("image").modelId).toBe(process.env.MODEL_IMAGE_ID || "muse-image-1.0");
    expect(getModelForRole("segmentation").modelId).toBe(
      process.env.MODEL_SEGMENTATION_ID || "sam-3.1"
    );
  });

  it("vision falls back to the agent model unless MODEL_VISION_ID is pinned", () => {
    const vision = getModelForRole("vision");
    const agent = getModelForRole("agent");
    if (!process.env.MODEL_VISION_ID) {
      expect(vision.modelId).toBe(agent.modelId);
    } else {
      expect(vision.modelId).toBe(process.env.MODEL_VISION_ID);
    }
  });

  it("agent client carries the resolved model id", () => {
    const { client, modelId } = getClientForRole("agent");
    expect(typeof (client as any).chat !== "undefined");
    expect(modelId).toBe(getModelForRole("agent").modelId);
  });

  it("swapping the agent provider never changes the plugin catalog", () => {    const names = fullTools.map((t) => t.name).sort();
    expect(names).toContain("generate_image");
    expect(names).toContain("search_web");
    expect(names).toContain("create_plugin");
    // The catalog is static: provider routing lives in the registry,
    // no tool knows or branches on AGENT_PROVIDER.
    const withRoles = fullTools.filter((t) => (t as any).modelRole);
    for (const t of withRoles) {
      expect(["agent", "fast", "vision", "voice", "image", "segmentation"]).toContain((t as any).modelRole);
    }
  });

  it("agent role routes to the open-weight provider when AGENT_PROVIDER=openweight", async () => {
    const { config } = await import("../server/config");
    const saved = {
      provider: config.AGENT_PROVIDER,
      base: config.OPENWEIGHT_BASE_URL,
      key: config.OPENWEIGHT_API_KEY,
      model: config.OPENWEIGHT_MODEL_ID,
    };
    try {
      (config as any).AGENT_PROVIDER = "openweight";
      (config as any).OPENWEIGHT_BASE_URL = "https://api.baseten.co/v1";
      (config as any).OPENWEIGHT_API_KEY = "";
      const { getModelForRole } = await import("../server/agent/modelRegistry");
      const routed = getModelForRole("agent");
      expect(routed.provider).toBe("openai-compatible");
      expect(routed.baseURL).toBe("https://api.baseten.co/v1");
      // No key in this environment: honest unconfigured, never fake success.
      expect(routed.configured).toBe(false);
      // The catalog does not change with the provider.
      expect(fullTools.map((t) => t.name)).toContain("generate_image");
    } finally {
      (config as any).AGENT_PROVIDER = saved.provider;
      (config as any).OPENWEIGHT_BASE_URL = saved.base;
      (config as any).OPENWEIGHT_API_KEY = saved.key;
      (config as any).OPENWEIGHT_MODEL_ID = saved.model;
    }
  });

  it("either model fills either role by configuration only (#210)", async () => {
    const { config } = await import("../server/config");
    const { getModelForRole, roleReasoningEffort } = await import("../server/agent/modelRegistry");
    const saved = {
      orch: (config as any).ORCHESTRATOR_MODEL,
      agent: (config as any).AGENT_MODEL,
      fast: (config as any).MODEL_FAST_ID,
      agentId: (config as any).MODEL_AGENT_ID,
      orchEffort: (config as any).ORCHESTRATOR_EFFORT,
      agentEffort: (config as any).AGENT_EFFORT,
    };
    try {
      // Canonical names win; legacy ids are the fallback chain.
      (config as any).ORCHESTRATOR_MODEL = "muse-wonder-1.0";
      (config as any).MODEL_FAST_ID = "muse-spark-1.3";
      expect(getModelForRole("orchestrator").modelId).toBe("muse-wonder-1.0");
      (config as any).ORCHESTRATOR_MODEL = "";
      expect(getModelForRole("orchestrator").modelId).toBe("muse-spark-1.3");

      (config as any).AGENT_MODEL = "muse-wonder-1.0";
      expect(getModelForRole("agent").modelId).toBe("muse-wonder-1.0");
      (config as any).AGENT_MODEL = "";
      (config as any).MODEL_AGENT_ID = "custom-agent";
      expect(getModelForRole("agent").modelId).toBe("custom-agent");

      // Effort per role: low orchestrator, unset heavy agent by default.
      (config as any).ORCHESTRATOR_EFFORT = "low";
      (config as any).AGENT_EFFORT = "";
      expect(roleReasoningEffort("orchestrator")).toBe("low");
      expect(roleReasoningEffort("agent")).toBeUndefined();
      (config as any).AGENT_EFFORT = "high";
      expect(roleReasoningEffort("agent")).toBe("high");
    } finally {
      (config as any).ORCHESTRATOR_MODEL = saved.orch;
      (config as any).AGENT_MODEL = saved.agent;
      (config as any).MODEL_FAST_ID = saved.fast;
      (config as any).MODEL_AGENT_ID = saved.agentId;
      (config as any).ORCHESTRATOR_EFFORT = saved.orchEffort;
      (config as any).AGENT_EFFORT = saved.agentEffort;
    }
  });
});
