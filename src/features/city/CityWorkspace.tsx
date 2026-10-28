import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Flame,
  Terminal,
  Sparkles,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DynamicTabContainer } from "@/features/dock/DynamicTabContainer";
import { useCityWorkspace } from "./useCityWorkspace";
import { CityOverview } from "./CityOverview";
import { NotesView } from "./tools/NotesView";
import { SourcesView } from "./tools/SourcesView";
import { QuestsView } from "./tools/QuestsView";
import { TerminalView } from "./tools/TerminalView";
import type { CityWorkspaceProps } from "./types";

export function CityWorkspace({
  cityId,
  activeToolId: controlledActiveToolId,
  onSelectTool,
  onBackToWorld,
  className = "",
}: CityWorkspaceProps) {
  const [internalActiveTool, setInternalActiveTool] = useState<string>("overview");
  const activeTool = controlledActiveToolId ?? internalActiveTool;

  const { data, saveNote, toggleQuest } = useCityWorkspace(cityId);

  const handleSelectTool = (toolId: string) => {
    if (controlledActiveToolId === undefined) {
      setInternalActiveTool(toolId);
    }
    onSelectTool?.(toolId);
  };

  // Check if activeTool matches an agent dynamic tab
  const dynamicTab = data.dynamicTabs.find((t) => t.id === activeTool);

  return (
    <div className={`flex flex-col w-full max-w-5xl mx-auto p-4 sm:p-6 gap-6 ${className}`}>
      {/* Persistent Breadcrumbs Navigation Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        {/* Breadcrumb path */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToWorld}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 px-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>World Map</span>
          </Button>

          <span className="text-border text-sm">/</span>

          <span className="text-xs font-mono text-muted-foreground">
            {data.region}
          </span>

          <span className="text-border text-sm">/</span>

          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-foreground text-sm">
              {data.title}
            </span>
            <Badge variant="outline" className="border-primary/40 text-primary gap-1 text-[11px] font-mono py-0 h-5">
              Lvl {data.level}
            </Badge>
          </div>
        </div>

        {/* Workspace Active Indicator */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <Badge variant="secondary" className="gap-1.5 text-xs font-mono py-1">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-lime)] animate-pulse" />
            <span className="text-[var(--accent-lime)]">Active Workspace</span>
          </Badge>
        </div>
      </header>

      {/* Tool Navigation Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border/40 scrollbar-none">
        <button
          type="button"
          onClick={() => handleSelectTool("overview")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
            activeTool === "overview" || !activeTool || activeTool === "city"
              ? "bg-secondary text-primary border border-primary/30"
              : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Overview</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTool("notes")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
            activeTool === "notes"
              ? "bg-secondary text-primary border border-primary/30"
              : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Notes ({data.notes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTool("sources")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
            activeTool === "sources" || activeTool === "browser"
              ? "bg-secondary text-primary border border-primary/30"
              : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Sources ({data.sources.length})</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTool("quests")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
            activeTool === "quests"
              ? "bg-secondary text-primary border border-primary/30"
              : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <span>Quests ({data.quests.length})</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTool("terminal")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
            activeTool === "terminal"
              ? "bg-secondary text-primary border border-primary/30"
              : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Terminal</span>
        </button>

        {/* Dynamic tabs from agent */}
        {data.dynamicTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleSelectTool(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
              activeTool === tab.id
                ? "bg-secondary text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-card"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>{tab.title}</span>
          </button>
        ))}
      </div>

      {/* Main Workspace Viewport */}
      <main className="w-full flex-1">
        {dynamicTab ? (
          <div className="w-full h-[640px] rounded-xl overflow-hidden border border-border bg-card">
            <DynamicTabContainer
              tabId={dynamicTab.id}
              cityId={cityId}
              srcdoc={dynamicTab.srcdoc}
              title={dynamicTab.title}
              className="w-full h-full"
            />
          </div>
        ) : activeTool === "notes" ? (
          <NotesView
            notes={data.notes}
            cityName={data.title}
            onSaveNote={saveNote}
          />
        ) : activeTool === "sources" || activeTool === "browser" ? (
          <SourcesView
            sources={data.sources}
            cityName={data.title}
          />
        ) : activeTool === "quests" ? (
          <QuestsView
            quests={data.quests}
            cityName={data.title}
            onToggleQuest={toggleQuest}
          />
        ) : activeTool === "terminal" ? (
          <TerminalView
            cityId={cityId}
            cityName={data.title}
            notesCount={data.notes.length}
            sourcesCount={data.sources.length}
          />
        ) : (
          <CityOverview
            data={data}
            onSelectTool={handleSelectTool}
          />
        )}
      </main>
    </div>
  );
}
