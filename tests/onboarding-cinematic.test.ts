import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ONBOARDING_STEPS } from "../src/lib/store/useOnboardingStore";

const viewPath = resolve(__dirname, "../src/features/onboarding/OnboardingPluginView.tsx");
const appPath = resolve(__dirname, "../src/App.tsx");

/**
 * Cinematic onboarding tab (launch-video flow): center orb, live thought,
 * one narration line — auto-advancing, fully explained. No cards, no
 * mandatory Next, no floating overlay pills.
 */
describe("cinematic onboarding tab", () => {
  const source = readFileSync(viewPath, "utf-8");

  test("renders the video stage: orb, live thought, narration", () => {
    expect(source).toContain("ThoughtStream");
    expect(source).toContain("stepDef.narration");
    expect(source).toContain("<Orb");
  });

  test("stage auto-plays without mandatory clicks (engine owns the runtime)", () => {
    const enginePath = resolve(__dirname, "../src/features/onboarding/LiveOnboarding.tsx");
    const engine = readFileSync(enginePath, "utf-8");
    expect(engine).toContain("setTimeout");
    expect(engine).toContain("stepDef.durationMs");
    expect(engine).toContain("pushThought");
    expect(engine).toContain("TinyFish");
    // The tab itself carries no timers or choreography — pure stage.
    expect(source).not.toContain("setTimeout");
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

  test("every step carries its narration line", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.narration.length).toBeGreaterThan(0);
    }
  });
});
