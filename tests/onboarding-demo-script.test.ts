import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const scriptPath = resolve(__dirname, "../src/lib/onboarding/demoScript.ts");

/**
 * Scripted onboarding tour: typed per-step action lists over the same
 * real stores and capabilities the agent drives — no model calls, no
 * tokens, replayable. Fixtures are local JSON (zero network); nothing
 * is sent to the real chat; memory is demo-only (never written).
 */
describe("demo script runner", () => {
  const source = readFileSync(scriptPath, "utf8");

  it("runs typed actions, never fakes results", () => {
    expect(source).toContain("runDemoStep");
    expect(source).toContain("DemoAction");
    expect(source).toContain("/api/capabilities/invoke");
    expect(source).toContain("sources.import");
    expect(source).toContain("sources.remove");
    expect(source).toContain("notes.add");
    expect(source).toContain("notes.remove");
    // No model client anywhere: the scripted path drives stores +
    // capabilities directly; the live path (runLiveAutoStep) sends
    // through the real orchestrator loop instead of faking replies.
    expect(source).not.toContain("llmClient");
    expect(source).not.toContain("MODEL_");
    expect(source).toContain("sendMessage");
    expect(source).toContain("TURN_FAILURE_PREFIXES");
  });

  it("stays offline: fixture import, no search/fetch calls", () => {
    expect(source).toContain("DEMO_FIXTURES");
    expect(source).toContain("demoFixtures");
    expect(source).not.toContain("search.web");
    expect(source).not.toContain("search.fetch");
    expect(source).not.toContain("tinyfish");
    expect(source).not.toContain("/api/agent/memory/record");
    expect(source).not.toContain("/api/agent/memory/recall");
  });

  it("ghost prompt: typed into the composer, cleared, never sent", () => {
    expect(source).toContain('kind: "type"');
    expect(source).toContain('setDraft("")');
    expect(source).toContain("never sent");
  });

  it("memory is demo-only: animated, never written", () => {
    expect(source).toContain("memoryDemo");
    expect(source).toContain("demo only");
  });

  it("leaves no trace unless kept: snapshots, restore, cleanup", () => {
    expect(source).toContain("snapshotThemeOnce");
    expect(source).toContain("restoreThemeSnapshot");
    expect(source).toContain("snapshotDockOnce");
    expect(source).toContain("restoreDockSnapshot");
    expect(source).toContain("snapshotStep");
    expect(source).toContain("undoDemoStep");
    expect(source).toContain("deleteDemoData");
    expect(source).toContain("clearDemoMarks");
    expect(source).toContain("cleanupDemo");
  });

  it("opens demo surfaces beside the tour stage, never over it", () => {
    expect(source).toContain("showBeside");
    expect(source).toContain("openBeside");
    expect(source).toContain("clearDemoBeside");
    // Read step: video front and center, notes riding shotgun.
    expect(source).toContain('{ kind: "beside", id: "notes" }');
    expect(source).toContain('{ kind: "open", id: "browser" }');
    // Build step mounts the dashboard view.
    expect(source).toContain('kind: "dashboard"');
  });

  it("takes a breath before acting, then advances", () => {
    expect(source).toContain("Poly is on it");
  });

  it("spotlights whatever the demo is driving", () => {
    expect(source).toContain("spotTo");
    expect(source).toContain("clearSpot");
    expect(source).toContain("subscribeSpot");
    expect(source).toContain("getSpotSelector");
    expect(source).toContain("data-dock-tool-id");
  });

  it("autoplay flags control the engine chains", () => {
    expect(source).toContain("startDemoAutoplay");
    expect(source).toContain("stopDemoAutoplay");
    expect(source).toContain("isDemoAutoplay");
    expect(source).toContain("startLiveAuto");
    expect(source).toContain("stopLiveAuto");
    expect(source).toContain("isLiveAuto");
  });

  // Async script tests share module-level run state (in-flight guard,
  // busy count, autoplay flags) with each other — and bun may overlap
  // async its in one file. Serialize them so one run never steps on the
  // next (the product chain is sequential too: view kick, then engine).
  let demoTestChain: Promise<void> = Promise.resolve();
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = demoTestChain.then(fn, fn);
    demoTestChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  // Hermetic reduced motion regardless of leaked DOM globals from other
  // files in the shared process: full timings would exceed the timeout.
  // The stub is a full MediaQueryList mock — a leaked mounted component
  // from another file may call addEventListener during our store writes.
  function stubReducedMotion(): () => void {
    const prevWindow = (globalThis as any).window;
    const mql = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    };
    (globalThis as any).window = { matchMedia: () => mql };
    return () => {
      if (prevWindow === undefined) delete (globalThis as any).window;
      else (globalThis as any).window = prevWindow;
    };
  }

  it("a cancelled run aborts with demo-cancelled", () =>
    serialize(async () => {
      const script = await import("../src/lib/onboarding/demoScript");
      script.stopDemoAutoplay();
      await expect(script.runDemoStep("home")).rejects.toThrow("demo-cancelled");
      expect(script.isDemoAutoplay()).toBe(false);
    }));

  it("marks busy while a script runs so the tour timer holds", () =>
    serialize(async () => {
      const script = await import("../src/lib/onboarding/demoScript");
      const { useOnboardingStore } = await import("../src/lib/store/useOnboardingStore");
      const restoreWindow = stubReducedMotion();
      useOnboardingStore.setState({ isOpen: true, currentStep: "home", isPlaying: true, paused: false } as any);
      script.startDemoAutoplay();
      try {
        const running = script.runDemoStep("home");
        expect(script.isDemoBusy()).toBe(true);
        await running;
        expect(script.isDemoBusy()).toBe(false);
      } finally {
        script.stopDemoAutoplay();
        useOnboardingStore.setState({ isOpen: false, currentStep: "idle" } as any);
        restoreWindow();
      }
    }));

  it("types the prompt into the composer draft", () =>
    serialize(async () => {
      const script = await import("../src/lib/onboarding/demoScript");
      const { useConversationStore } = await import("../src/lib/agent/conversationStore");
      script.startLiveAuto();
      try {
        await script.typePromptText("hello world", { tickMs: 1, charsPerTick: 11 });
        expect(useConversationStore.getState().draft).toBe("hello world");
      } finally {
        script.stopLiveAuto();
        useConversationStore.getState().setDraft("");
      }
    }));

  it("completes a typed step end to end, clearing the ghost draft", () =>
    serialize(async () => {
      const script = await import("../src/lib/onboarding/demoScript");
      const { useConversationStore } = await import("../src/lib/agent/conversationStore");
      const { useOnboardingStore } = await import("../src/lib/store/useOnboardingStore");
      // Hermetic reduced motion: exercises the instant path deterministically.
      const restoreWindow = stubReducedMotion();
      useOnboardingStore.setState({ isOpen: true, currentStep: "customize", isPlaying: true, paused: false } as any);
      script.startDemoAutoplay();
      try {
        // Regression: the takeover check used a cached store snapshot, so
        // every typed step aborted on its second tick and the tour silently
        // advanced doing nothing.
        await script.runDemoStep("customize");
        expect(useConversationStore.getState().draft).toBe("");
        expect(script.isDemoBusy()).toBe(false);
      } finally {
        script.stopDemoAutoplay();
        useOnboardingStore.setState({ isOpen: false, currentStep: "idle" } as any);
        useConversationStore.getState().setDraft("");
        restoreWindow();
      }
    }));

  it("idle and handoff steps are no-ops", async () => {
    const script = await import("../src/lib/onboarding/demoScript");
    await expect(script.runDemoStep("idle")).resolves.toBe(false);
    await expect(script.runDemoStep("handoff")).resolves.toBe(false);
  });

  it("restore without a snapshot is a safe no-op", async () => {
    const script = await import("../src/lib/onboarding/demoScript");
    expect(() => script.restoreThemeSnapshot()).not.toThrow();
    expect(() => script.restoreDockSnapshot()).not.toThrow();
    expect(() => script.clearDemoMarks()).not.toThrow();
  });

  it("dashboard mounts as a demo-scoped ToolSurface view on live feed data", () => {
    const surface = readFileSync(resolve(__dirname, "../src/features/dock/ToolSurface.tsx"), "utf8");
    expect(surface).toContain('toolId === "demo-dashboard"');
    expect(source).toContain('{ kind: "dashboard" }');
    const view = readFileSync(resolve(__dirname, "../src/features/onboarding/DemoDashboard.tsx"), "utf8");
    expect(view).toContain("sources.list");
    expect(view).toContain('data-tour="dashboard"');
    expect(view).toContain("onboard-chip-in");
  });

  it("prev undoes the step, handoff offers keep or clean", () => {
    const engine = readFileSync(
      resolve(__dirname, "../src/features/onboarding/LiveOnboarding.tsx"),
      "utf8"
    );
    expect(engine).toContain("handlePrevStep");
    expect(engine).toContain("undoDemoStep");
    expect(engine).toContain("snapshotStep");
    const view = readFileSync(
      resolve(__dirname, "../src/features/onboarding/OnboardingPluginView.tsx"),
      "utf8"
    );
    expect(view).toContain("Keep this workspace");
    expect(view).toContain("Clean up demo");
    expect(view).toContain("markDemoAdopted");
    expect(view).toContain("cleanupDemo");
    expect(view).toContain("clearDemoMarks");
  });
});
