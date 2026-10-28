import { useState } from "react";
import {
  ArrowSquareOut,
  BookOpen,
  FileText,
  Video,
  Globe,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { openExternalUrl } from "@/lib/platform";
import type { CitySourceItem } from "../types";

interface SourcesViewProps {
  sources: CitySourceItem[];
  cityName: string;
}

export function SourcesView({ sources, cityName }: SourcesViewProps) {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredSources = sources.filter((item) => {
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "paper" && (item.kind === "paper" || item.title.toLowerCase().includes("paper"))) ||
      (activeFilter === "article" && item.kind === "article") ||
      (activeFilter === "video" && item.kind === "video");

    const matchesSearch =
      searchQuery === "" ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.why && item.why.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.domain && item.domain.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  const getKindIcon = (kind?: string) => {
    switch (kind) {
      case "paper":
        return <FileText size={16} className="text-[var(--accent-lime)]" />;
      case "video":
        return <Video size={16} className="text-[#9aa5b8]" />;
      case "course":
      case "article":
      default:
        return <BookOpen size={16} className="text-[#d1d6e2]" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Globe size={18} className="text-[var(--accent-lime)]" />
            <span>Research & Sources</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Primary sources gathered by TinyFish for {cityName}.
          </p>
        </div>

        {/* Search & Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <MagnifyingGlass size={14} className="text-muted-foreground absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sources..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white/[0.04] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:bg-white/[0.08] w-40 sm:w-48 font-sans"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03]">
            {["all", "paper", "article", "video"].map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-colors font-sans cursor-pointer ${
                  activeFilter === filter
                    ? "bg-white/[0.1] text-white font-medium"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Source Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSources.length > 0 ? (
          filteredSources.map((source, index) => (
            <div
              key={`${source.url}-${index}`}
              className="rounded-2xl bg-[#0c0e14] border border-white/5 p-5 flex flex-col justify-between hover:border-white/15 transition-colors group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {getKindIcon(source.kind)}
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {source.kind || "source"}
                    </span>
                  </div>
                  {source.domain && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {source.domain}
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-medium text-white group-hover:text-[var(--accent-lime)] transition-colors leading-snug mb-2">
                  {source.title}
                </h4>

                {source.why && (
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    {source.why}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => openExternalUrl(source.url)}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-lime)] hover:underline cursor-pointer"
                >
                  <span>Open Primary Source</span>
                  <ArrowSquareOut size={14} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-16 text-center text-xs text-muted-foreground">
            No sources match the search query.
          </div>
        )}
      </div>
    </div>
  );
}
