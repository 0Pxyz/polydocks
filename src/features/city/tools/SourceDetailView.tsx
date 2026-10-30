import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConversationStore, type OpenedSourceView } from "@/lib/agent/conversationStore";
import { VideoEmbed } from "@/features/video/VideoEmbed";
import { VIDEO_IFRAME_ATTRS } from "@/features/video/embedConfig";
import { videoThumbnailCandidates } from "../sourceMedia";

interface SourceDetailViewProps {
  view: OpenedSourceView;
}

/**
 * An opened source occupies the Sources plugin area in place of the feed:
 * plain container, no card chrome, no X, no overlay over the chat.
 * Plain-text header actions: back to the feed, save as quest.
 * NOTE: header/action copy is Portuguese per explicit product direction
 * (deviates from the repo English-only rule; flagged in the PR).
 */
export function SourceDetailView({ view }: SourceDetailViewProps) {
  const closeReader = useConversationStore((s) => s.closeReader);
  const promoteReaderToQuest = useConversationStore((s) => s.promoteReaderToQuest);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
  }, [view.sourceId, view.url]);

  const derivedThumb = videoThumbnailCandidates(view.url)[0];
  const thumb = view.image || derivedThumb || null;
  const ytWatch = view.url.includes("youtube.com") || view.url.includes("youtu.be");
  const vimeoWatch = view.url.includes("vimeo.com");

  return (
    <div className="flex w-full max-w-5xl flex-col">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={closeReader}
          className="bg-transparent p-0 text-xs text-muted-foreground hover:text-white transition-colors cursor-pointer"
        >
          ← Voltar ao feed
        </button>
        {view.sourceId && view.cityId && (
          <button
            type="button"
            onClick={() => {
              setSaved(true);
              void promoteReaderToQuest();
            }}
            className="bg-transparent p-0 text-xs text-[var(--accent-lime)] hover:underline cursor-pointer"
          >
            {saved ? "Guardado ✓" : "Guardar como quest"}
          </button>
        )}
      </div>

      <h3 className="mt-3 text-xl font-semibold leading-snug text-white">{view.title}</h3>
      {view.site && <p className="mt-1 font-mono text-xs text-muted-foreground">{view.site}</p>}

      <div className="mt-4 flex w-full flex-col">
        {view.mode === "video" && (
          <VideoEmbed url={view.url} title={view.title} thumbnail={thumb} />
        )}

        {view.mode === "reader" && (
          <article className="w-full">
            {thumb && (
              <img src={thumb} alt="" loading="lazy" className="aspect-video w-full object-cover" />
            )}
            <div className="prose prose-invert prose-sm mt-4 max-w-none text-[#d7dbe4] prose-a:text-[var(--accent-lime)] prose-headings:text-white">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{view.markdown || ""}</ReactMarkdown>
            </div>
          </article>
        )}

        {view.mode === "embed" && view.embedUrl && (
          <iframe
            src={view.embedUrl}
            title={view.title}
            sandbox={VIDEO_IFRAME_ATTRS.sandbox}
            referrerPolicy={VIDEO_IFRAME_ATTRS.referrerPolicy}
            allow={VIDEO_IFRAME_ATTRS.allow}
            allowFullScreen
            className="min-h-[480px] w-full border-0 bg-white"
          />
        )}

        {view.mode === "external" && (
          <div className="flex w-full flex-col">
            {thumb && (
              <img src={thumb} alt="" loading="lazy" className="aspect-video w-full object-cover" />
            )}
            <div className="mt-4 flex flex-col items-start gap-2">
              {view.reason && (
                <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{view.reason}</p>
              )}
              <a
                href={view.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--accent-lime)] hover:underline cursor-pointer"
              >
                {ytWatch ? "Ver no YouTube" : vimeoWatch ? "Ver no Vimeo" : "Abrir original ↗"}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
