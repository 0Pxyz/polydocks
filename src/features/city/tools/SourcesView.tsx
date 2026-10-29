import { useMemo, useState } from "react";
import { BookOpen, FileText, Play, Video } from "@phosphor-icons/react";
import { openExternalUrl } from "@/lib/platform";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";
import type { CitySourceItem } from "../types";

interface SourcesViewProps {
  sources: CitySourceItem[];
  cityName: string;
  loading?: boolean;
}

type KindFilter = "all" | "article" | "video" | "paper";

const FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: "all", label: "Tudo" },
  { id: "article", label: "Artigos" },
  { id: "video", label: "Vídeos" },
  { id: "paper", label: "Papers" },
];

function siteFromItem(item: CitySourceItem): string {
  if (item.site) return item.site;
  if (item.domain) return item.domain;
  if (item.url && item.url !== "#") {
    try {
      return new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      return "web";
    }
  }
  return "";
}

function timeLine(item: CitySourceItem): string {
  const site = siteFromItem(item);
  const parts: string[] = [];
  if (site) parts.push(site);

  if (item.kind === "video" && typeof item.durationSec === "number" && item.durationSec > 0) {
    const m = Math.floor(item.durationSec / 60);
    const s = item.durationSec % 60;
    parts.push(`${m}:${String(s).padStart(2, "0")}`);
  } else if (typeof item.readMinutes === "number" && item.readMinutes > 0) {
    parts.push(`${item.readMinutes} min`);
  } else if (item.publishedAt) {
    const y = new Date(item.publishedAt).getFullYear();
    if (Number.isFinite(y)) parts.push(String(y));
  } else {
    parts.push(item.kind === "video" ? "vídeo" : item.kind === "paper" ? "paper" : "6 min");
  }

  return parts.join(" · ");
}

function KindGlyph({ kind, className }: { kind?: string; className?: string }) {
  if (kind === "video") return <Video size={24} className={className} weight="light" />;
  if (kind === "paper") return <FileText size={24} className={className} weight="light" />;
  return <BookOpen size={24} className={className} weight="light" />;
}

function NoImageFallback({ item, large = false }: { item: CitySourceItem; large?: boolean }) {
  const site = siteFromItem(item);
  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[var(--accent-dim)]/30 overflow-hidden">
      {site ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${site}&sz=128`}
          alt=""
          className={cn(
            "rounded-2xl drop-shadow-md opacity-90 transition-transform duration-300 group-hover:scale-105",
            large ? "w-16 h-16 sm:w-20 sm:h-20" : "w-12 h-12"
          )}
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = "none";
          }}
        />
      ) : (
        <KindGlyph kind={item.kind} className={cn("text-[var(--accent)]", large ? "w-12 h-12" : "w-8 h-8")} />
      )}
    </div>
  );
}

export function SourcesView({ sources, cityName, loading = false }: SourcesViewProps) {
  const [activeFilter, setActiveFilter] = useState<KindFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const validSources = useMemo(() => {
    return sources.filter(
      (s) => s && s.title && s.url && s.url !== "#" && s.title !== "Primary Source"
    );
  }, [sources]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return validSources.filter((item) => {
      if (activeFilter !== "all" && item.kind !== activeFilter) return false;
      if (!q) return true;
      const site = siteFromItem(item).toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        (item.hook && item.hook.toLowerCase().includes(q)) ||
        (item.why && item.why.toLowerCase().includes(q)) ||
        site.includes(q)
      );
    });
  }, [validSources, activeFilter, searchQuery]);

  const handleOpen = async (item: CitySourceItem) => {
    if (!item.url || item.url === "#") return;

    // Trigger capability sources.open via API if source id exists
    if (item.id) {
      try {
        void fetch(`/api/plugins/sources/open`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: { id: item.id } }),
        });
      } catch {
        // Non-blocking
      }
    }

    // Open external URL or reader next to chat
    try {
      openExternalUrl(item.url);
    } catch {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  };

  const [featured, ...rest] = filtered;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-8 pb-16">
      {/* Immersive Header: Typography & Text Filters Only */}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-white">{cityName}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground font-mono">
            {validSources.length > 0 ? `${validSources.length} fontes curadas` : "Fontes de conhecimento"}
          </p>
        </div>

        <div className="flex items-center gap-6">
          {/* Pure Text Filters */}
          <div className="flex items-center gap-5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={cn(
                  "bg-transparent p-0 text-xs transition-colors cursor-pointer",
                  activeFilter === f.id
                    ? "font-medium text-white"
                    : "text-muted-foreground hover:text-white"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Minimalist Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar..."
            className="w-32 sm:w-40 bg-transparent px-1 py-0.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-white/10 focus:border-white/30 font-sans transition-colors"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-8">
          <Skeleton className="aspect-[21/9] sm:aspect-[2.4/1] w-full rounded-2xl" />
          <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2">
            <Skeleton className="aspect-video w-full rounded-xl" />
            <Skeleton className="aspect-video w-full rounded-xl" />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-xs text-muted-foreground font-mono">
          Nenhuma fonte encontrada. Peça ao agente para adicionar fontes com sources.add.
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {/* Featured Highlight: Full-bleed with Title over Gradient */}
          {featured && (
            <div
              key={featured.id || featured.url}
              onClick={() => handleOpen(featured)}
              className="group relative w-full aspect-[21/9] sm:aspect-[2.4/1] overflow-hidden rounded-2xl cursor-pointer select-none"
            >
              {featured.image ? (
                <img
                  src={featured.image}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                />
              ) : (
                <NoImageFallback item={featured} large />
              )}

              {/* Full-bleed dark gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent flex flex-col justify-end p-6 sm:p-8">
                <h3 className="text-xl sm:text-2xl font-semibold text-white leading-snug transition-colors group-hover:text-[var(--accent)]">
                  {featured.title}
                </h3>
                <p className="mt-2 text-xs text-muted-foreground font-mono">
                  {timeLine(featured)}
                </p>
                {featured.hook && (
                  <p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/80 line-clamp-2 font-sans">
                    {featured.hook}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 2-Column Grid: Rest with image, title, and grey line ("site · 6 min") */}
          {rest.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
              {rest.map((item) => (
                <div
                  key={item.id || item.url}
                  onClick={() => handleOpen(item)}
                  className="group cursor-pointer select-none flex flex-col"
                >
                  <div className="relative w-full aspect-video overflow-hidden rounded-xl bg-white/[0.03]">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                      />
                    ) : (
                      <NoImageFallback item={item} />
                    )}
                    {item.kind === "video" && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm shadow-md">
                          <Play size={16} weight="fill" />
                        </span>
                      </div>
                    )}
                  </div>

                  <h4 className="mt-3 text-[15px] font-medium leading-snug text-white/90 transition-colors group-hover:text-white line-clamp-2">
                    {item.title}
                  </h4>

                  <p className="mt-1 text-xs text-muted-foreground font-mono">
                    {timeLine(item)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
