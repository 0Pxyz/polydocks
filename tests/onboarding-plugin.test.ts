import { describe, it, expect, beforeEach } from "bun:test";
import { pluginRegistry } from "../server/plugins/registry";
import { capabilityBus } from "../server/plugins/bus";
import {
  onboardingPluginManifest,
  registerOnboardingPlugin,
} from "../server/plugins/first-party/onboarding";

describe("First-Party AGENT_ONBOARDING Plugin", () => {
  const opts = { step: 1, workspaceId: "default" };

  beforeEach(() => {
    registerOnboardingPlugin();
  });

  it("manifest exports clean first-party contract", () => {
    expect(onboardingPluginManifest.id).toBe("onboarding");
    expect(onboardingPluginManifest.trust).toBe("first-party");
    expect(onboardingPluginManifest.capabilities.length).toBeGreaterThanOrEqual(4);

    const capIds = onboardingPluginManifest.capabilities.map((c) => c.id);
    expect(capIds).toContain("onboarding.start");
    expect(capIds).toContain("onboarding.step");
    expect(capIds).toContain("onboarding.skip");
    expect(capIds).toContain("onboarding.replay");
  });

  it("registers in pluginRegistry cleanly", () => {
    const installed = pluginRegistry.get("onboarding");
    expect(installed).toBeDefined();
    expect(installed?.manifest.name).toBe("Live Onboarding Demo");
  });

  it("invokes onboarding.start on capabilityBus", async () => {
    const res = await capabilityBus.invoke("onboarding.start", { replay: false }, opts);
    expect(res).toBeDefined();
    expect(res.success).toBe(true);
    expect((res.data as any)?.status).toBe("started");
    expect((res.data as any)?.step).toBe("home");
    expect((res.data as any)?.steps).toEqual([
      "home",
      "customize",
      "research",
      "breathe",
      "coin",
      "focus",
      "handoff",
    ]);
  });

  it("invokes onboarding.step across choreography sequence", async () => {
    const res1 = await capabilityBus.invoke(
      "onboarding.step",
      { stepId: "research", autoAdvance: true },
      opts
    );
    expect(res1.success).toBe(true);
    expect((res1.data as any)?.status).toBe("active");
    expect((res1.data as any)?.step).toBe("research");

    const res2 = await capabilityBus.invoke(
      "onboarding.step",
      { stepId: "breathe", autoAdvance: true },
      opts
    );
    expect(res2.success).toBe(true);
    expect((res2.data as any)?.status).toBe("active");
    expect((res2.data as any)?.step).toBe("breathe");
  });

  it("invokes onboarding.skip to gracefully complete demo", async () => {
    const res = await capabilityBus.invoke("onboarding.skip", {}, opts);
    expect(res.success).toBe(true);
    expect((res.data as any)?.status).toBe("completed");
    expect((res.data as any)?.step).toBe("idle");
  });

  it("invokes onboarding.replay to restart sequence from beginning", async () => {
    const res = await capabilityBus.invoke("onboarding.replay", {}, opts);
    expect(res.success).toBe(true);
    expect((res.data as any)?.status).toBe("replayed");
    expect((res.data as any)?.step).toBe("home");
  });
});
