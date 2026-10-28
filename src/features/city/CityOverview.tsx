import {
  FileText,
  Flame,
  Terminal,
  Sparkles,
  ArrowRight,
  Layers,
  Globe,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CityWorkspaceData } from "./types";

interface CityOverviewProps {
  data: CityWorkspaceData;
  onSelectTool: (toolId: string) => void;
}

export function CityOverview({ data, onSelectTool }: CityOverviewProps) {
  const completedQuests = data.quests.filter((q) => q.completed).length;

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Concept Hero Card */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-card via-card/90 to-secondary/30 p-6 sm:p-8 overflow-hidden shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-primary uppercase tracking-wider">
                Autonomous Concept Node
              </span>
              <span className="text-border">•</span>
              <span className="text-xs font-mono text-muted-foreground">
                Region: {data.region}
              </span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              {data.title}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="border-primary/40 text-primary gap-1 font-mono text-xs">
              <Sparkles className="h-3 w-3" />
              Lvl {data.level}
            </Badge>
            <Badge variant="secondary" className="gap-1 font-mono text-xs">
              <Flame className="h-3 w-3 text-amber-500 fill-amber-500" />
              {completedQuests}/{data.quests.length} Quests
            </Badge>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          This persistent city workspace is curated by the dock agent. Notes, primary research papers from TinyFish, quests, and dynamic tool extensions are mounted directly into your dock.
        </p>

        <div className="mt-6 pt-4 border-t border-border/60 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>Storage: workspace/{data.cityId}/</span>
            <span>Agent: muse-spark-1.3</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-lime)] animate-ping" />
            <span className="text-[var(--accent-lime)]">Workspace Active</span>
          </div>
        </div>
      </div>

      {/* 4 Interactive Workspace Tool Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Notes Card */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectTool("notes")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectTool("notes");
            }
          }}
          className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="font-display font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                  Notes & Syntheses
                </h3>
              </div>
              <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                {data.notes.length} {data.notes.length === 1 ? "note" : "notes"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Markdown notes, takeaways, and structural analyses created by you and the dock agent.
            </p>
          </div>

          <div className="pt-4 border-t border-border/40 flex items-center justify-between text-xs text-primary font-mono mt-4">
            <span>Open Notes Editor</span>
            <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Sources Card */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectTool("sources")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectTool("sources");
            }
          }}
          className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Globe className="w-4 h-4" />
                </div>
                <h3 className="font-display font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                  Research & Sources
                </h3>
              </div>
              <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                {data.sources.length} sources
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Curated primary sources, breakthrough papers, and videos crawled and synthesized via TinyFish.
            </p>
          </div>

          <div className="pt-4 border-t border-border/40 flex items-center justify-between text-xs text-primary font-mono mt-4">
            <span>Explore Sources Feed</span>
            <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Quests Card */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectTool("quests")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectTool("quests");
            }
          }}
          className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                  <Flame className="w-4 h-4" />
                </div>
                <h3 className="font-display font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                  Learning Quests
                </h3>
              </div>
              <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                {completedQuests}/{data.quests.length} Done
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Active learning challenges and practice drills to solidify mastery and advance your player level.
            </p>
          </div>

          <div className="pt-4 border-t border-border/40 flex items-center justify-between text-xs text-primary font-mono mt-4">
            <span>View Mastery Quests</span>
            <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Terminal Card */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectTool("terminal")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectTool("terminal");
            }
          }}
          className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                  <Terminal className="w-4 h-4" />
                </div>
                <h3 className="font-display font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                  City Terminal
                </h3>
              </div>
              <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                &gt;_ CLI
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Command line interface for city inspection, workspace operations, and direct agent instructions.
            </p>
          </div>

          <div className="pt-4 border-t border-border/40 flex items-center justify-between text-xs text-primary font-mono mt-4">
            <span>Launch City Console</span>
            <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      {/* Dynamic Agent Tools Section (if any installed) */}
      {data.dynamicTabs.length > 0 && (
        <div className="rounded-xl border border-border bg-card/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Dynamic Tools Synthesized by Agent ({data.dynamicTabs.length})
            </h3>
            <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
              Sandboxed Iframe Runtime
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {data.dynamicTabs.map((tab) => (
              <Button
                key={tab.id}
                variant="secondary"
                size="sm"
                onClick={() => onSelectTool(tab.id)}
                className="justify-between text-xs h-10 border border-border hover:border-primary/40"
              >
                <div className="flex items-center gap-2 truncate">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="truncate">{tab.title}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
