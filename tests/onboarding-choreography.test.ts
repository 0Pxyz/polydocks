import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_PROMPTS,
} from "../src/lib/store/useOnboardingStore";
import { DOCK_CORE_CATALOG } from "../src/lib/dock/dockModel";

const appPath = resolve(__dirname, "../src/App.tsx");
const enginePath = resolve(__dirname, "../src/features/onboarding/LiveOnboarding.tsx");
const surfacePath = resolve(__dirname, "../src/features/dock/ToolSurface.tsx");

/**
 * Onboarding blank states (#373): the dock focused tools the main
 * viewport never routed (notes opened nothing — only generated plugin
 * tabs rendered), and the tour engine ignored the step dockTarget on
 * auto-advance, leaving an empty chat where the narration promised a
 * build. These pins keep both honest.
 */
describe("onboarding choreography (#373)", () => {
  test("main viewport routes every ToolSurface static id (notes, inspect included)", () => {
    const app = readFileSync(appPath, "utf-8");
    // Single source: App reuses the shared set, it never lists ids inline.
    expect(app).toContain("MAIN_VIEW_STATIC_IDS");
    expect(app).not.toContain('"deep-work-flashcards", "bitcoin-viewer"');
    const model = readFileSync(resolve(__dirname, "../src/lib/dock/dockModel.ts"), "utf-8");
    const match = model.match(/MAIN_VIEW_STATIC_IDS = new Set\(\[([^\]]+)\]\)/);
    expect(match).not.toBeNull();
    const ids = match![1];
    // Every builtin the dock offers (minus agent: it is the chat panel,
    // not a ToolSurface id) must reach the viewport — via MAIN_STATIC_IDS
    // or the dedicated browser clause next to it.
    const browserRouted = app.includes('activeToolId === "browser"');
    expect(browserRouted).toBe(true);
    for (const item of DOCK_CORE_CATALOG) {
      if (item.id === "agent" || item.id === "browser") continue;
      expect(ids).toContain(`"${item.id}"`);
    }
    expect(ids).toContain('"notes"');
    expect(ids).toContain('"inspect"');
  });

  test("engine honors step dockTarget on every entry (auto + manual)", () => {
    const engine = readFileSync(enginePath, "utf-8");
    expect(engine).toContain("stepDef.dockTarget");
    expect(engine).toContain('dock.openTool(target)');
    expect(engine).toContain('openTool("agent")');
    // Agent steps raise the chat panel — focusing the dock record alone
    // leaves the composer closed (the blank-chat symptom).
    expect(engine).toContain("setLayoutState");
    // No hardcoded per-step force() subset anymore.
    expect(engine).not.toContain("force(\"settings\")");
    expect(engine).not.toContain('force("")');
  });

  test("build steps prefill the composer draft (visible feature, never auto-send)", () => {
    const engine = readFileSync(enginePath, "utf-8");
    expect(engine).toContain("ONBOARDING_STEP_PROMPTS");
    expect(engine).toContain("setDraft(prompt)");
    expect(engine).not.toContain("sendMessage(");
    for (const step of ["breathe", "coin", "focus"] as const) {
      const prompt = ONBOARDING_STEP_PROMPTS[step];
      expect(typeof prompt).toBe("string");
      expect(prompt!.length).toBeGreaterThan(20);
    }
    expect(ONBOARDING_STEP_PROMPTS.breathe).toContain("Box Breathing");
    expect(ONBOARDING_STEP_PROMPTS.coin).toContain("Decision Coin");
    expect(ONBOARDING_STEP_PROMPTS.focus).toContain("Focus Timer");
  });

  test("engine never claims a mount it did not perform", () => {
    const engine = readFileSync(enginePath, "utf-8");
    expect(engine).not.toContain("Mounted box-breathing");
    expect(engine).not.toContain("Mounted decision-coin");
  });

  test("unknown surfaces render an explicit fallback, never a blank void", () => {
    const surface = readFileSync(surfacePath, "utf-8");
    expect(surface).toContain("No view component registered");
  });

  test("every step still carries narration + a dock target contract", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.narration.length).toBeGreaterThan(0);
      expect(step.dockTarget).toBeDefined();
    }
  });
});
