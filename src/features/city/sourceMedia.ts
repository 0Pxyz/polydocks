/**
 * Pure view helpers for source cards and the in-plugin detail view.
 * No React, no network: every branch is unit-testable.
 *
 * The YouTube/Vimeo id patterns mirror server/video/ids.ts (front code
 * cannot import server modules). If the server pattern changes, update
 * both and keep the five-format test green on each side.
 */

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function validYoutubeId(id: string | null): id is string {
  return typeof id === "string" && YT_ID_RE.test(id);
}

/** Mirrors server/video/ids.ts: watch, youtu.be, shorts, embed, live. */
export function youtubeIdFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return validYoutubeId(id) ? id : null;
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const v = u.searchParams.get("v");
      if (validYoutubeId(v)) return v;
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

/** Mirrors server/video/ids.ts. */
export function vimeoIdFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
      const m = u.pathname.match(/^\/(?:video\/)?(\d+)/);
      return m ? m[1] : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Thumbnail candidates in preference order. A saved image always wins;
 * otherwise derive from the video id (YouTube tries maxresdefault first
 * and falls back to hqdefault on 404 via onError); empty when the url
 * is not a video.
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
 * Deterministic territory accent derived from the city name: a stable
 * hue the no-image tile renders on. Same city always yields same color.
 */
export function territoryAccent(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 55% 38%)`;
}
