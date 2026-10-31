import { youtubeIdFromUrl, vimeoIdFromUrl } from "@/features/video/ids";

/**
 * Pure source-tile helpers (no React, no network): thumbnails, favicons,
 * deterministic motifs and accents for imageless tiles. Unit-testable;
 * shared by present and future source surfaces.
 */

export function videoThumbnailCandidates(url: string, savedImage?: string | null): string[] {
  if (savedImage && savedImage.trim().length > 0) return [savedImage];
  const yt = youtubeIdFromUrl(url);
  if (yt) {
    return [
      `https://i.ytimg.com/vi/${yt}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
    ];
  }
  const vm = vimeoIdFromUrl(url);
  if (vm) return [`https://vumbnail.com/${vm}.jpg`];
  return [];
}

/** Favicon service URL for the no-image tile (letter fallback on error). */
export function faviconUrl(site: string | undefined, size = 128): string | null {
  const domain = (site || "").trim().toLowerCase();
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(domain)}`;
}

/**
 * Deterministic tile variant from the source URL: stable per item,
 * spreads imageless tiles across rotations so the feed never looks cloned.
 */
export function tileVariant(url: string): number {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  }
  return hash % 3;
}

/** Pattern motif per source kind for the imageless tile. */
export function tileMotif(kind?: string | null): "rules" | "diagonal" | "rings" {
  if (kind === "paper") return "rules";
  if (kind === "video") return "rings";
  return "diagonal";
}

/**
 * Deterministic accent derived from a key: a stable hue the no-image tile
 * renders on. Same key always yields the same color.
 */
export function tileAccent(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 55% 38%)`;
}
