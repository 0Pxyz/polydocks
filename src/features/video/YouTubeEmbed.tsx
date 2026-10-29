import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { VIDEO_IFRAME_ATTRS, youtubeEmbedSrc, youtubeWatchUrl } from "./embedConfig";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<boolean> | null = null;

/** Loads the YouTube IFrame API once; resolves false offline/blocked. */
function loadYouTubeApi(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.YT?.Player) return Promise.resolve(true);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(false), 8000);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try { prev?.(); } catch { /* ignore */ }
        window.clearTimeout(timer);
        resolve(true);
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.onerror = () => {
        window.clearTimeout(timer);
        apiPromise = null;
        resolve(false);
      };
      document.head.appendChild(tag);
    });
  }
  return apiPromise;
}

interface YouTubeEmbedProps {
  videoId: string;
  title: string;
  /** Big thumbnail shown only when the owner disabled embeds. */
  thumbnail?: string | null;
  className?: string;
}

/**
 * YouTube player with an owner-disabled-embeds fallback. The IFrame API
 * reports error 101/150/153 (embedding disabled, private, not found);
 * on error the player is replaced by the thumbnail + title + a single
 * "Ver no YouTube" action that only then leaves the app. The YouTube
 * error screen itself is never shown.
 */
export function YouTubeEmbed({ videoId, title, thumbnail, className = "" }: YouTubeEmbedProps) {
  const [failed, setFailed] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setFailed(false);
    let cancelled = false;
    let player: any = null;
    void loadYouTubeApi().then((ok) => {
      if (!ok || cancelled || !frameRef.current || typeof window === "undefined" || !window.YT?.Player) return;
      try {
        player = new window.YT.Player(frameRef.current, {
          events: {
            onError: () => {
              if (!cancelled) setFailed(true);
            },
          },
        });
      } catch {
        // If attaching fails the iframe stays as-is; only API-reported
        // errors swap to the fallback, never a blank screen.
      }
    });
    return () => {
      cancelled = true;
      try { player?.destroy?.(); } catch { /* ignore */ }
    };
  }, [videoId]);

  if (failed) {
    return (
      <div className={cn("flex w-full flex-col overflow-hidden rounded-xl bg-black/40", className)}>
        {thumbnail && (
          <img src={thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
        )}
        <div className="flex flex-col items-start gap-2 p-4">
          <p className="text-sm font-semibold leading-snug text-white">{title}</p>
          <a
            href={youtubeWatchUrl(videoId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent-lime)] hover:underline cursor-pointer"
          >
            Ver no YouTube
          </a>
        </div>
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <iframe
      ref={frameRef}
      src={youtubeEmbedSrc(videoId, origin)}
      title={title}
      sandbox={VIDEO_IFRAME_ATTRS.sandbox}
      referrerPolicy={VIDEO_IFRAME_ATTRS.referrerPolicy}
      allow={VIDEO_IFRAME_ATTRS.allow}
      allowFullScreen
      onError={() => setFailed(true)}
      className={cn("aspect-video w-full border-0 rounded-xl bg-black/40", className)}
    />
  );
}
