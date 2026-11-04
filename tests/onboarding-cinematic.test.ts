import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ONBOARDING_STEPS, ONBOARDING_STEP_PROMPTS } from "../src/lib/store/useOnboardingStore";

const viewPath = resolve(__dirname, "../src/features/onboarding/OnboardingPluginView.tsx");
const appPath = resolve(__dirname, "../src/App.tsx");

/**
 * First-class product demo: one continuous session driven by the real
 * agent. The tour presents real prompts, sends them through the normal
 * orchestrator loop, and keeps execution visible in the bottom chat.
 * No fabricated chain-of-thought, no fake TinyFish results.
 */
describe("onboarding as product demo", () => {
  const source = readFileSync(viewPath, "utf-8");

  test("renders the demo stage: orb, live thought, narration, real run", () => {
    expect(source).toContain("ThoughtStream");
    expect(source).toContain("stepDef.narration");
    expect(source).toContain("<Orb");
    expect(source).toContain("Play demo");
    expect(source).toContain("Auto live tour");
    expect(source).toContain("handlePlay");
    expect(source).toContain("handleAutoLive");
    expect(source).toContain("runDemoStep");
    expect(source).toContain("runLiveAutoStep");
  });

  test("stages follow the demo mission, each with a real prompt", () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(ids).toEqual(["home", "customize", "research", "read", "build", "remember", "handoff"]);
    expect(ONBOARDING_STEP_PROMPTS.customize).toContain("Settings");
    expect(ONBOARDING_STEP_PROMPTS.customize).toContain("ONE batch");
    expect(ONBOARDING_STEP_PROMPTS.customize).toContain("fewest tool calls");
    expect(ONBOARDING_STEP_PROMPTS.customize).toContain("dock.open onboarding");
    expect(ONBOARDING_STEP_PROMPTS.customize).toContain("raw.githubusercontent.com");
    expect(ONBOARDING_STEP_PROMPTS.research).toContain("TinyFish");
    expect(ONBOARDING_STEP_PROMPTS.read).toContain("reader");
    expect(ONBOARDING_STEP_PROMPTS.build).toContain("dashboard");
    expect(ONBOARDING_STEP_PROMPTS.remember).toContain("Notes");
  });

  test("engine keeps the bottom chat visible, never fakes tool results", () => {
    const enginePath = resolve(__dirname, "../src/features/onboarding/LiveOnboarding.tsx");
    const engine = readFileSync(enginePath, "utf-8");
    expect(engine).toContain('setLayoutState("sheet")');
    expect(engine).toContain("setDraft");
    // The tour never overrides the user's dock position.
    expect(engine).not.toContain("setDockPosition");
    // No fabricated literature results in the demo narrative.
    expect(engine).not.toContain("Sophie Leroy");
    expect(engine).not.toContain("Attention Residue");
    // The tab itself carries no auto-advance choreography — pure stage
    // plus the instant customize preview (the runtime still owns the tour).
    expect(source).not.toContain("stepDef.durationMs");
    expect(source).not.toContain("pushThought");
    expect(source).not.toContain("shouldPauseTourOnTakeover");
  });

  test("has no card grid, no Start Walkthrough gate", () => {
    expect(source).not.toContain("What Poly Demonstrates");
    expect(source).not.toContain("Start Walkthrough");
    expect(source).not.toContain("Live Tool Synthesis");
  });

  test("pauses on user takeover in the engine, not the tab (survives focus switches)", () => {
    const enginePath = resolve(__dirname, "../src/features/onboarding/LiveOnboarding.tsx");
    const engine = readFileSync(enginePath, "utf-8");
    expect(engine).toContain("shouldPauseTourOnTakeover");
    expect(source).not.toContain("shouldPauseTourOnTakeover");
  });

  test("the tour lives in the tab only (no floating overlay mounted)", () => {
    const app = readFileSync(appPath, "utf-8");
    expect(app).not.toContain("LiveOnboardingOverlay");
  });

  test("dead overlay/modal prototypes are gone", () => {
    expect(existsSync(resolve(__dirname, "../src/features/onboarding/LiveOnboardingOverlay.tsx"))).toBe(false);
    expect(existsSync(resolve(__dirname, "../src/features/onboarding/OnboardingModal.tsx"))).toBe(false);
  });

  test("every step carries its narration line", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.narration.length).toBeGreaterThan(0);
    }
  });
});
