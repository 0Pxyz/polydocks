import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import { VideoEmbed } from "@/features/video/VideoEmbed";

export interface ReaderViewProps {
  url: string;
  onBack?: () => void;
  onOpenExternal?: (url: string) => void;
  className?: string;
  /** Prefetched content (e.g. from a saved source): skips the live fetch. */
  initialMarkdown?: string;
  initialTitle?: string;
}

interface ReaderPayload {
  success: boolean;
  kind?: "video" | "article";
  url?: string;
  title?: string;
  markdown?: string;
  embedUrl?: string;
  error?: string;
}

/**
 * Native in-app Reader: articles render as app components (Markdown, no
 * iframe, so frame-blocking sites still open); videos use embeds.
 */
export function ReaderView({ url, onBack, onOpenExternal, className = "", initialMarkdown, initialTitle }: ReaderViewProps) {
  const [payload, setPayload] = useState<ReaderPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Saved sources already carry verified markdown: render it directly
    // instead of re-fetching (works offline, never blank on blocked hosts).
    if (typeof initialMarkdown === "string" && initialMarkdown.trim().length > 0) {
      setPayload({ success: true, kind: "article", url, title: initialTitle || url, markdown: initialMarkdown });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setPayload(null);
    fetch(`/api/reader?url=${encodeURIComponent(url)}`)
      .then(async (res) => {
        const data = (await res.json()) as ReaderPayload;
        if (cancelled) return;
        if (!data.success) {
          setError(data.error || `Could not open this link (HTTP ${res.status})`);
        } else {
          setPayload(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open this link");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, initialMarkdown, initialTitle]);

  return (
    <div className={cn("w-full h-full flex-1 flex flex-col min-h-0 bg-transparent", className)}>
      <div className="flex items-center gap-3 px-1 py-2 text-xs">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-[var(--accent-lime)] hover:underline cursor-pointer"
          >
            ← Back
          </button>
        )}
        <span className="truncate text-[#9aa5b8] flex-1">{payload?.title || url}</span>
        <button
          type="button"
          onClick={() => (onOpenExternal ? onOpenExternal(url) : window.open(url, "_blank", "noopener,noreferrer"))}
          className="text-[#9aa5b8] hover:underline cursor-pointer shrink-0"
        >
          Open original
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#9aa5b8]" aria-live="polite">
          <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-[var(--accent-lime)] animate-spin" />
          <span className="text-xs">Loading article…</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-[#9aa5b8] px-6 text-center">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => (onOpenExternal ? onOpenExternal(url) : window.open(url, "_blank", "noopener,noreferrer"))}
            className="text-[var(--accent-lime)] hover:underline cursor-pointer"
          >
            Try the original page instead
          </button>
        </div>
      )}

      {!loading && !error && payload?.kind === "video" && payload.embedUrl && (
        <div className="flex-1 min-h-0 flex flex-col">
          {payload.embedUrl.includes("youtube.com/embed/") ||
          payload.embedUrl.includes("player.vimeo.com") ? (
            <VideoEmbed url={payload.url || url} title={payload.title || "Video"} className="flex-1 min-h-[320px]" />
          ) : (
            <video src={payload.embedUrl} controls className="w-full max-h-full rounded-xl">
              Your browser does not support this video.
            </video>
          )}
        </div>
      )}

      {!loading && !error && payload?.kind === "article" && (
        <article className="flex-1 min-h-0 overflow-y-auto px-2 pb-8 max-w-3xl w-full mx-auto">
          {payload.title && (
            <h1 className="text-lg font-semibold text-white mb-4 leading-snug">{payload.title}</h1>
          )}
          <div className="prose prose-invert prose-sm max-w-none text-[#d7dbe4] prose-a:text-[var(--accent-lime)] prose-headings:text-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{payload.markdown || ""}</ReactMarkdown>
          </div>
        </article>
      )}
    </div>
  );
}
