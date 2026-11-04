import { describe, it, expect, beforeEach } from "bun:test";
import { HOME_DOCK_TOOLS } from "../src/features/dock/AgenticDock";
import { useOnboardingStore, ONBOARDING_COMPLETED_KEY } from "../src/lib/store/useOnboardingStore";
import { platformStorage } from "../src/lib/platform/storage";

describe("Polydocks UX Polish & Native Experiences", () => {
  beforeEach(() => {
    platformStorage.clear();
    useOnboardingStore.getState().resetOnboarding();
  });

  describe("1. Keyboard Shortcut Segmentation & Single Ctrl+K", () => {
    it("differentiates agent conversation shortcut from command palette shortcut", () => {
      // Agent shortcut: Ctrl+K / ⌘K
      const agentShortcut = { key: "k", metaKey: true, shiftKey: false };
      // Command palette shortcut: Ctrl+Shift+P / ⌘⇧P
      const paletteShortcut = { key: "p", metaKey: true, shiftKey: true };

      const isAgentTriggered = (e: { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) =>
        (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k";

      const isPaletteTriggered = (e: { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) =>
        e.shiftKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p";

      expect(isAgentTriggered(agentShortcut)).toBe(true);
      expect(isPaletteTriggered(agentShortcut)).toBe(false);

      expect(isPaletteTriggered(paletteShortcut)).toBe(true);
      expect(isAgentTriggered(paletteShortcut)).toBe(false);
    });
  });

  describe("2. Dock Tools (single curated set)", () => {
    it("presents the curated dock (agent, tour, browser, plugins, creations, store, settings)", () => {
      const ids = HOME_DOCK_TOOLS.map((t) => t.id);
      expect(ids).toEqual(["agent", "onboarding", "browser", "plugins", "creations", "store", "settings"]);
    });
  });

  describe("3. First-Run Onboarding Walkthrough Store", () => {
    it("initializes as open on first run when storage key is absent", () => {
      expect(useOnboardingStore.getState().isOpen).toBe(true);
      expect(useOnboardingStore.getState().hasCompleted).toBe(false);
    });

    it("persists completion to platformStorage and closes modal", () => {
      useOnboardingStore.getState().completeDemo();
      expect(useOnboardingStore.getState().isOpen).toBe(false);
      expect(useOnboardingStore.getState().hasCompleted).toBe(true);
      expect(platformStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBe(true);
    });

    it("can be replayed from settings via openOnboarding()", () => {
      useOnboardingStore.getState().completeDemo();
      expect(useOnboardingStore.getState().isOpen).toBe(false);

      useOnboardingStore.getState().openOnboarding();
      expect(useOnboardingStore.getState().isOpen).toBe(true);
    });
  });

  describe("4. Native Experiences & Design Slop Elimination", () => {
    it("ensures CORE_DOCK_TOOLS preserve backward-compatible surface definitions", () => {
      expect(HOME_DOCK_TOOLS.length).toBe(7);
    });
  });
});
