import { useEffect, useMemo, useState } from "react";
import { Play } from "@phosphor-icons/react";
import { openExternalUrl } from "@/lib/platform";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { faviconUrl, territoryAccent, videoThumbnailCandidates } from "../sourceMedia";
import type { CitySourceItem } from "../types";

interface SourcesViewProps {
  sources: CitySourceItem[];
  cityName: string;
  loading?: boolean;
  /** Open a saved source in the in-chat reader (same path as sources.open). Falls back to a new tab only when absent. */
  onOpen?: (sourceId: string) => void;
}

type KindFilter = "all" | "article" | "paper" | "video";

const FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "article", label: "Articles" },
  { id: "paper", label: "Papers" },
  { id: "video", label: "Videos" },
];

function timeLine(item: CitySourceItem): string | null {
  const parts: string[] = [];
  if (item.domain) parts.push(item.domain);
  if (item.kind === "video" && typeof item.durationSec === "number") {
    const m = Math.floor(item.durationSec / 60);
    const s = item.durationSec % 60;
    parts.push(`${m}:${String(s).padStart(2, "0")}`);
  } else if (typeof item.readMinutes === "number") {
    parts.push(`${item.readMinutes} min`);
  } else if (item.publishedAt) {
    const y = new Date(item.publishedAt).getFullYear();
    if (Number.isFinite(y)) parts.push(String(y));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function SourceImage({ item, large, accentKey }: { item: CitySourceItem; large?: boolean; accentKey: string }) {
  // Saved image wins; otherwise derive from the video id (maxres first,
  // hq on 404). No image: big favicon on the territory accent color.
  const candidates = useMemo(
    () => videoThumbnailCandidates(item.url, item.image),
    [item.url, item.image]
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [item.url, item.image]);
  const [faviconGone, setFaviconGone] = useState(false);
  useEffect(() => setFaviconGone(false), [item.domain]);

  if (candidates.length > 0 && idx < candidates.length) {
    return (
      <div className={cn("relative w-full overflow-hidden bg-white/[0.04]", large ? "aspect-[21/9]" : "aspect-video")}>
        <img
          src={candidates[idx]}
          alt=""
          loading="lazy"
          onError={() => setIdx((i) => Math.min(i + 1, candidates.length - 1))}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {item.kind === "video" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white">
              <Play size={18} weight="fill" />
            </span>
          </div>
        )}
        {item.hook && (
          <div className="absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/85 to-transparent p-3 pt-8 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <p className="text-xs leading-relaxed text-white/90">{item.hook}</p>
          </div>
        )}
      </div>
    );
  }
  const fav = item.domain ? faviconUrl(item.domain) : null;
  const letter = (item.domain || item.title || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className="relative flex w-full items-center justify-center overflow-hidden"
      style={{ background: territoryAccent(accentKey), aspectRatio: large ? "21 / 9" : "16 / 9" }}
    >
      <span className="text-5xl font-semibold text-white/90">{letter}</span>
      {fav && !faviconGone && (
        <img
          src={fav}
          alt=""
          loading="lazy"
          onError={() => setFaviconGone(true)}
          className="absolute h-16 w-16 object-contain drop-shadow-lg"
        />
      )}
      {item.hook && (
        <div className="absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/85 to-transparent p-3 pt-8 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <p className="text-xs leading-relaxed text-white/90">{item.hook}</p>
        </div>
      )}
    </div>
  );
}

export function SourcesView({ sources, cityName, loading = false, onOpen }: SourcesViewProps) {
  const [activeFilter, setActiveFilter] = useState<KindFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sources.filter((item) => {
      if (activeFilter !== "all" && item.kind !== activeFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.why && item.why.toLowerCase().includes(q)) ||
        (item.hook && item.hook.toLowerCase().includes(q)) ||
        (item.domain && item.domain.toLowerCase().includes(q))
      );
    });
  }, [sources, activeFilter, searchQuery]);

  const [featured, ...rest] = filtered;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Research &amp; Sources</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {sources.length > 0 ? `${sources.length} saved for ${cityName}` : `Sources for ${cityName}`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={cn(
                  "bg-transparent p-0 text-xs transition-colors cursor-pointer",
                  activeFilter === f.id ? "font-semibold text-white" : "text-muted-foreground hover:text-white"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="w-36 bg-transparent px-1 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none border-b border-white/10 focus:border-white/25 font-sans"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="aspect-[21/9] w-full" />
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="aspect-video w-full" />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          Nothing here yet — ask the agent to find sources for this city.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {featured && (
            <button
              key={featured.url}
              type="button"
              onClick={() => (featured.id && onOpen ? onOpen(featured.id) : openExternalUrl(featured.url))}
              className="group block w-full cursor-pointer bg-transparent p-0 text-left"
            >
              <SourceImage item={featured} large accentKey={cityName} />
              <h4 className="mt-3 text-xl font-semibold leading-snug text-white transition-colors group-hover:text-[var(--accent-lime)]">
                {featured.title}
              </h4>
              {timeLine(featured) && (
                <p className="mt-1 text-xs text-muted-foreground">{timeLine(featured)}</p>
              )}
              {featured.why && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{featured.why}</p>
              )}
            </button>
          )}
          {rest.length > 0 && (
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2">
              {rest.map((item) => (
                <button
                  key={item.id || item.url}
                  type="button"
                  onClick={() => (item.id && onOpen ? onOpen(item.id) : openExternalUrl(item.url))}
                  className="group block w-full cursor-pointer bg-transparent p-0 text-left"
                >
                  <SourceImage item={item} accentKey={cityName} />
                  <h4 className="mt-2.5 text-[15px] font-semibold leading-snug text-white transition-colors group-hover:text-[var(--accent-lime)]">
                    {item.title}
                  </h4>
                  {timeLine(item) && (
                    <p className="mt-1 text-xs text-muted-foreground">{timeLine(item)}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
