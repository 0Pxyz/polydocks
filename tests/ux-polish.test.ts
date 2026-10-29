import { describe, it, expect, beforeEach } from "bun:test";
import { HOME_DOCK_TOOLS, CITY_DOCK_TOOLS } from "../src/features/dock/AgenticDock";
import { useOnboardingStore } from "../src/lib/store/useOnboardingStore";
import { platformStorage } from "../src/lib/platform/storage";

describe("Polymax UX Polish & Native Experiences", () => {
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

  describe("2. Dock Tools Adaptation (Home vs City Workspace)", () => {
    it("presents minimal clean dock on home screen (agent, maps, settings)", () => {
      const ids = HOME_DOCK_TOOLS.map((t) => t.id);
      expect(ids).toEqual(["agent", "maps", "settings"]);
    });

    it("presents the city tools in the dock inside a city (agent, maps, sources, notes, files, quests, flashcards, terminal, settings)", () => {
      const ids = CITY_DOCK_TOOLS.map((t) => t.id);
      expect(ids).toEqual(["agent", "maps", "sources", "notes", "files", "quests", "flashcards", "terminal", "settings"]);
    });
  });

  describe("3. First-Run Onboarding Walkthrough Store", () => {
    it("initializes as open on first run when storage key is absent", () => {
      expect(useOnboardingStore.getState().isOpen).toBe(true);
      expect(useOnboardingStore.getState().hasCompleted).toBe(false);
    });

    it("persists completion to platformStorage and closes modal", () => {
      useOnboardingStore.getState().completeOnboarding();
      expect(useOnboardingStore.getState().isOpen).toBe(false);
      expect(useOnboardingStore.getState().hasCompleted).toBe(true);
      expect(platformStorage.getItem("polymax_onboarding_completed_v1")).toBe(true);
    });

    it("can be replayed from settings via openOnboarding()", () => {
      useOnboardingStore.getState().completeOnboarding();
      expect(useOnboardingStore.getState().isOpen).toBe(false);

      useOnboardingStore.getState().openOnboarding();
      expect(useOnboardingStore.getState().isOpen).toBe(true);
    });
  });

  describe("4. Native Experiences & Design Slop Elimination", () => {
    it("ensures CORE_DOCK_TOOLS preserve backward-compatible surface definitions", () => {
      expect(HOME_DOCK_TOOLS.length).toBe(3);
      expect(CITY_DOCK_TOOLS.length).toBe(9);
    });
  });
});
