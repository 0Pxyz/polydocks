/**
 * Single definition for in-app video iframe attributes.
 *
 * strict-origin-when-cross-origin is what avoids YouTube "Error 153 /
 * Video player configuration error" (no-referrer starves the player of
 * the origin context it requires). youtube.com embeds (not -nocookie)
 * complete the fix. The iframe test pins these values.
 */

export const VIDEO_IFRAME_ATTRS = {
  referrerPolicy: "strict-origin-when-cross-origin",
  sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups",
  allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
} as const;

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeEmbedSrc(videoId: string, origin: string): string {
  return (
    `https://www.youtube.com/embed/${videoId}` +
    `?rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(origin)}`
  );
}
