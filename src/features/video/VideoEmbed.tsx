import { useState } from "react";
import { cn } from "@/lib/cn";
import { youtubeIdFromUrl, vimeoIdFromUrl } from "@/features/city/sourceMedia";
import { VIDEO_IFRAME_ATTRS } from "./embedConfig";
import { YouTubeEmbed } from "./YouTubeEmbed";

interface VideoEmbedProps {
  url: string;
  title: string;
  /** Big thumbnail for the disabled-embed fallback. */
  thumbnail?: string | null;
  className?: string;
}

/**
 * In-app video by URL: YouTube (with disabled-embed fallback) or Vimeo.
 * Non-video urls render nothing; callers decide the external treatment.
 */
export function VideoEmbed({ url, title, thumbnail, className = "" }: VideoEmbedProps) {
  const [vimeoFailed, setVimeoFailed] = useState(false);
  const yt = youtubeIdFromUrl(url);
  if (yt) {
    return <YouTubeEmbed videoId={yt} title={title} thumbnail={thumbnail} className={className} />;
  }
  const vm = vimeoIdFromUrl(url);
  if (vm && !vimeoFailed) {
    return (
      <iframe
        src={`https://player.vimeo.com/video/${vm}`}
        title={title}
        sandbox={VIDEO_IFRAME_ATTRS.sandbox}
        referrerPolicy={VIDEO_IFRAME_ATTRS.referrerPolicy}
        allow={VIDEO_IFRAME_ATTRS.allow}
        allowFullScreen
        onError={() => setVimeoFailed(true)}
        className={cn("aspect-video w-full border-0 rounded-xl bg-black/40", className)}
      />
    );
  }
  if (vm && vimeoFailed) {
    return (
      <div className={cn("flex w-full flex-col overflow-hidden rounded-xl bg-black/40", className)}>
        {thumbnail && (
          <img src={thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
        )}
        <div className="flex flex-col items-start gap-2 p-4">
          <p className="text-sm font-semibold leading-snug text-white">{title}</p>
          <a
            href={`https://vimeo.com/${vm}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent-lime)] hover:underline cursor-pointer"
          >
            Ver no Vimeo
          </a>
        </div>
      </div>
    );
  }
  return null;
}
