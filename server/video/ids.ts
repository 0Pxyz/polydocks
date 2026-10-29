/**
 * Single definition for video URL parsing (YouTube + Vimeo).
 *
 * Both `server/plugins/sources.ts` (enrichment) and
 * `server/reader/service.ts` (native reader) derive ids and embed URLs
 * from here, so the five YouTube formats behave identically everywhere.
 */

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function validYoutubeId(id: string | null): id is string {
  return typeof id === "string" && YT_ID_RE.test(id);
}

/**
 * Extracts the 11-char YouTube video id from all five supported formats:
 * watch?v=, youtu.be/, shorts/, embed/, live/.
 * Returns null for playlists, channels, and anything without a video id.
 */
export function youtubeId(raw: string): string | null {
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

/** Extracts the numeric Vimeo id (plain, channel, or /video/ paths). */
export function vimeoId(raw: string): string | null {
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
 * Canonical YouTube embed. youtube.com (not -nocookie) with a real
 * referrer is what avoids "Error 153 / Video player configuration error".
 */
export function youtubeEmbedUrl(raw: string): string | null {
  const id = youtubeId(raw);
  return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1` : null;
}

/** Player URL for Vimeo (embeds are owner-controlled there too). */
export function vimeoEmbedUrl(raw: string): string | null {
  const id = vimeoId(raw);
  return id ? `https://player.vimeo.com/video/${id}` : null;
}

/** Either YouTube or Vimeo player URL, or null for non-video URLs. */
export function videoEmbedUrl(raw: string): string | null {
  return youtubeEmbedUrl(raw) ?? vimeoEmbedUrl(raw);
}

/** hqdefault always exists; maxresdefault is tried first at render time. */
export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Best-effort Vimeo thumbnail without an oEmbed round-trip. */
export function vimeoThumbnail(id: string): string {
  return `https://vumbnail.com/${id}.jpg`;
}

/**
 * Derives a saved-row thumbnail from the URL alone (used by the
 * backfill migration and as a render-time fallback when image is null).
 */
export function thumbnailForUrl(raw: string): string | null {
  const yt = youtubeId(raw);
  if (yt) return youtubeThumbnail(yt);
  const vm = vimeoId(raw);
  if (vm) return vimeoThumbnail(vm);
  return null;
}
