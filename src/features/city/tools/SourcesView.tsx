import { useState } from "react";
import { ExternalLink, BookOpen, FileText, Video, Globe, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        return <FileText className="w-3.5 h-3.5 text-primary" />;
      case "video":
        return <Video className="w-3.5 h-3.5 text-amber-400" />;
      case "course":
      case "article":
      default:
        return <BookOpen className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            Curated Research & Discovery Feed
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Primary sources, breakthrough papers, and architectural guides gathered by TinyFish for {cityName}.
          </p>
        </div>

        {/* Search & Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sources..."
              className="pl-8 pr-2.5 py-1 text-xs rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 w-36 sm:w-44"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-card border border-border">
            {["all", "paper", "article", "video"].map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`px-2.5 py-1 rounded text-xs capitalize transition-colors font-mono cursor-pointer ${
                  activeFilter === filter
                    ? "bg-secondary text-primary font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
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
              className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between hover:border-primary/40 transition-all group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {getKindIcon(source.kind)}
                    <span className="text-[11px] font-mono uppercase text-muted-foreground tracking-wider">
                      {source.kind || "source"}
                    </span>
                  </div>
                  {source.domain && (
                    <span className="text-[10px] font-mono text-muted-foreground/70 bg-secondary px-2 py-0.5 rounded">
                      {source.domain}
                    </span>
                  )}
                </div>

                <h4 className="font-display text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug mb-2">
                  {source.title}
                </h4>

                {source.why && (
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    {source.why}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-border/60 flex items-center justify-between mt-auto">
                <span className="text-[11px] font-mono text-[var(--accent-lime)] flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> SOTA Verified
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openExternalUrl(source.url)}
                  className="h-7 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                >
                  <span>Open Primary Source</span>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full p-8 text-center rounded-xl border border-dashed border-border bg-card/40">
            <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-foreground">No sources matching filter</p>
            <p className="text-xs text-muted-foreground mt-1">
              Trigger a research discovery task via the agent to fetch more sources.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
