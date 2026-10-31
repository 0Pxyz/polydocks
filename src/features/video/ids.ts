/**
 * Pure video URL helpers (no React, no network).
 * Mirror server/video/ids.ts: watch, youtu.be, shorts, embed, live.
 * If the server pattern changes, update both.
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
