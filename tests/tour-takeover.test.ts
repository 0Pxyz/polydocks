import { describe, expect, it } from "bun:test";
import { shouldPauseTourOnTakeover } from "../src/lib/onboarding/tourTakeover";

/**
 * User-takeover detection (#250 follow-up): the tour pauses the moment the
 * user drives the dock elsewhere — and never on its own choreography.
 */
describe("tour takeover", () => {
  const playing = {
    wasOpen: true,
    isPlaying: true,
    paused: false,
    stepChanged: false,
    prevTool: "browser",
    activeTool: "browser",
    forcedTool: "browser",
  };

  it("pauses when the user switches to another tab", () => {
    expect(shouldPauseTourOnTakeover({ ...playing, activeTool: "settings" })).toBe(true);
  });

  it("pauses when the user closes the forced tab", () => {
    expect(shouldPauseTourOnTakeover({ ...playing, activeTool: null })).toBe(true);
  });

  it("stays playing when nothing moved", () => {
    expect(shouldPauseTourOnTakeover(playing)).toBe(false);
  });

  it("ignores the tour's own settled focus", () => {
    // Auto-advance forced flashcards; focus settled there afterwards.
    expect(
      shouldPauseTourOnTakeover({
        ...playing,
        prevTool: "browser",
        activeTool: "deep-work-flashcards",
        forcedTool: "deep-work-flashcards",
      })
    ).toBe(false);
  });

  it("ignores step transitions (the new force is still in flight)", () => {
    expect(
      shouldPauseTourOnTakeover({
        ...playing,
        stepChanged: true,
        activeTool: "settings",
      })
    ).toBe(false);
  });

  it("never fires when closed, finished, or already paused", () => {
    expect(shouldPauseTourOnTakeover({ ...playing, wasOpen: false, activeTool: "settings" })).toBe(false);
    expect(shouldPauseTourOnTakeover({ ...playing, isPlaying: false, activeTool: "settings" })).toBe(false);
    expect(shouldPauseTourOnTakeover({ ...playing, paused: true, activeTool: "settings" })).toBe(false);
  });
});
