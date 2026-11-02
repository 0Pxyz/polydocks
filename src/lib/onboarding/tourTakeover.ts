/**
 * User-takeover detection for the onboarding tour (#250 follow-up).
 *
 * The tour auto-advances and force-focuses scripted tabs while playing. Any
 * manual dock switch (open/focus/close a tab) must pause the tour instead of
 * being yanked back seconds later. The tour cannot tell its own forced focus
 * from the user's at the dock level, so the caller records every forced
 * tool in `forcedTool` and reports step transitions via `stepChanged` —
 * pure predicate, no React, fully tested.
 */

export interface TakeoverSnapshot {
  /** The tour was already open on the previous observation. */
  wasOpen: boolean;
  /** The tour is currently playing (not finished or closed). */
  isPlaying: boolean;
  /** The user already paused via the pill controls. */
  paused: boolean;
  /** The step changed in this observation (the new step's force is in flight). */
  stepChanged: boolean;
  /** Focused dock tab on the previous observation (`null` = none). */
  prevTool: string | null;
  /** Focused dock tab now (`null` = none). */
  activeTool: string | null;
  /** Last tool the tour itself forced (`null` = the tour forced nothing yet). */
  forcedTool: string | null;
}

/**
 * True when the user drove the dock elsewhere and the tour must pause
 * (stop the auto-advance timer and stop force-focusing scripted tabs).
 * Never fires on the tour's own focus changes or on step transitions.
 */
export function shouldPauseTourOnTakeover(s: TakeoverSnapshot): boolean {
  if (!s.wasOpen || !s.isPlaying || s.paused) return false;
  // A step change carries its own force-focus; judging this render would
  // mistake the tour's choreography for a user switch.
  if (s.stepChanged) return false;
  // Nothing moved.
  if (s.prevTool === s.activeTool) return false;
  // The move matches the tour's last forced focus (settled choreography).
  return s.activeTool !== s.forcedTool;
}
