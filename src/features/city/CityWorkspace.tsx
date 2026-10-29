import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { DynamicTabContainer } from "@/features/dock/DynamicTabContainer";
import { spring, prefersReducedMotion } from "@/lib/motion";
import { useCityWorkspace } from "./useCityWorkspace";
import { CityOverview } from "./CityOverview";
import { getLastCityTool } from "@/lib/city/cityModel";
import { useCitySummaryStore } from "@/lib/store/useCitySummaryStore";
import { NotesView } from "./tools/NotesView";
import { SourcesView } from "./tools/SourcesView";
import { QuestsView } from "./tools/QuestsView";
import { TerminalView } from "./tools/TerminalView";
import { FilesView } from "./tools/FilesView";
import { FlashcardsView } from "./FlashcardsView";
import { PluginsView } from "@/features/plugins/PluginsView";
import type { CityWorkspaceProps } from "./types";

type ExtendedCityWorkspaceProps = CityWorkspaceProps;

export function CityWorkspace({
  cityId,
  activeToolId: controlledActiveToolId,
  onSelectTool,
  className = "",
}: ExtendedCityWorkspaceProps) {
  const [internalActiveTool, setInternalActiveTool] = useState<string>("overview");
  const activeTool = controlledActiveToolId ?? internalActiveTool;
  const isReduced = prefersReducedMotion();

  const { data, loading, saveNote, toggleQuest, openSource } = useCityWorkspace(cityId);

  // Publish live counts for the dock badges once the workspace loads.
  useEffect(() => {
    if (loading) return;
    useCitySummaryStore.getState().setSummary(cityId, {
      sources: data.sources.length,
      notes: data.notes.length,
      quests: data.quests.length,
      doneQuests: data.quests.filter((q) => q.completed).length,
    });
  }, [cityId, loading, data.sources, data.notes, data.quests]);

  const handleSelectTool = (toolId: string) => {
    if (controlledActiveToolId === undefined) {
      setInternalActiveTool(toolId);
    }
    onSelectTool?.(toolId);
  };

  // Check if activeTool matches an agent dynamic tab
  const dynamicTab = data.dynamicTabs.find((t) => t.id === activeTool);

  return (
    <div className={`w-full flex flex-col items-center select-none ${className}`}>
      {/* Main Viewport with Fluid Spring Transitions */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTool || "overview"}
          initial={{ opacity: 0, y: isReduced ? 0 : 8, scale: isReduced ? 1 : 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: spring.soft }}
          exit={{ opacity: 0, y: isReduced ? 0 : -8, scale: isReduced ? 1 : 0.98, transition: { duration: 0.15 } }}
          className="w-full flex-1 flex flex-col items-center"
        >
          {dynamicTab ? (
            <div className="w-full max-w-5xl h-[640px] rounded-2xl overflow-hidden bg-transparent">
              <DynamicTabContainer
                tabId={dynamicTab.id}
                cityId={cityId}
                srcdoc={dynamicTab.srcdoc}
                title={dynamicTab.title}
                className="w-full h-full"
              />
            </div>
          ) : activeTool === "flashcards" ? (
            <FlashcardsView
              cityName={data.title}
              sources={data.sources}
            />
          ) : activeTool === "files" ? (
            <FilesView
              cityId={cityId}
              cityName={data.title}
            />
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
              loading={loading}
              onOpen={(id) => void openSource(id)}
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
          ) : activeTool === "plugins" ? (
            <PluginsView
              onDismiss={() => handleSelectTool("overview")}
            />
          ) : activeTool === "" || activeTool === "overview" ? (
            <CityOverview data={data} isFirstVisit={!getLastCityTool(cityId)} />
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
