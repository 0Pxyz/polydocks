/**
 * Collision-aware label placement for the particle map.
 *
 * Pure functions operating in world coordinates (zoom-independent: no overlap
 * in world space means no overlap on screen). The canvas builds one candidate
 * per territory and draws only what this module places.
 */

export interface LabelCandidate {
  id: string;
  /** World-space center of the territory. */
  x: number;
  y: number;
  /** Full label text (truncated here, never in the data). */
  text: string;
  /** Higher wins collisions: selected/hovered first, then larger territories. */
  priority: number;
  /** Number of concepts; breaks ties toward more active territories. */
  concepts?: number;
}

export interface PlacedLabel extends LabelCandidate {
  text: string;
  /** World-space box used for collision. */
  box: { left: number; top: number; right: number; bottom: number };
}

/** Label sits below the territory center, mirroring the canvas renderer. */
export const LABEL_DY = 18;
/** Estimated width of one monospace glyph at the 11px label size. */
export const LABEL_CHAR_WIDTH = 6.6;
/** Label line height in world units. */
export const LABEL_LINE_HEIGHT = 15;
/** Long names truncate instead of stacking or overflowing. */
export const LABEL_MAX_CHARS = 20;

export function truncateLabel(text: string, maxChars: number = LABEL_MAX_CHARS): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars).trimEnd()}…`;
}

function boxesOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * How many labels stay readable at a zoom level. Zooming out hides the
 * long tail; zooming in reveals more. Selected/hovered labels always win
 * their slots regardless of zoom.
 */
export function maxLabelsForZoom(zoom: number): number {
  if (zoom < 0.5) return 2;
  if (zoom < 0.7) return 6;
  if (zoom < 1.0) return 12;
  return 24;
}

export interface LabelViewport {
  /** Visible world-space rectangle. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  zoom: number;
}

/**
 * Greedy placement by priority: the first label takes its box, later labels
 * that overlap an already placed box are hidden. Hidden labels reappear on
 * hover or selection because those states sort first.
 */
export function layoutLabels(
  candidates: LabelCandidate[],
  viewport: LabelViewport
): PlacedLabel[] {
  const cap = maxLabelsForZoom(viewport.zoom);
  const ranked = [...candidates].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (b.concepts || 0) - (a.concepts || 0);
  });

  const placed: PlacedLabel[] = [];
  let budgeted = 0;
  for (const candidate of ranked) {
    const isPriority = candidate.priority >= 900;
    if (!isPriority) {
      if (budgeted >= cap) continue;
    }
    const text = truncateLabel(candidate.text);
    const width = text.length * LABEL_CHAR_WIDTH + 8;
    const top = candidate.y + LABEL_DY;
    const box = {
      left: candidate.x - width / 2,
      top,
      right: candidate.x + width / 2,
      bottom: top + LABEL_LINE_HEIGHT,
    };
    // Cull labels outside the visible world rectangle.
    if (
      box.right < viewport.left ||
      box.left > viewport.right ||
      box.bottom < viewport.top ||
      box.top > viewport.bottom
    ) {
      continue;
    }
    if (placed.some((other) => boxesOverlap(other.box, box))) {
      continue;
    }
    placed.push({ ...candidate, text, box });
    if (!isPriority) budgeted += 1;
  }
  return placed;
}

/**
 * Priority for a territory: selected and hovered states always win, the
 * rest scale with territory size so larger regions stay labeled first.
 */
export function territoryPriority(
  opts: { selected: boolean; hovered: boolean; radius: number; concepts?: number }
): number {
  if (opts.selected) return 1000;
  if (opts.hovered) return 900;
  return 100 + opts.radius + (opts.concepts || 0) * 2;
}
