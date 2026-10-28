import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, CaretLeft } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { DynamicTabContainer } from "@/features/dock/DynamicTabContainer";
import { spring, prefersReducedMotion } from "@/lib/motion";
import { useCityWorkspace } from "./useCityWorkspace";
import { CityOverview } from "./CityOverview";
import { NotesView } from "./tools/NotesView";
import { SourcesView } from "./tools/SourcesView";
import { QuestsView } from "./tools/QuestsView";
import { TerminalView } from "./tools/TerminalView";
import { FilesView } from "./tools/FilesView";
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
  const isReduced = prefersReducedMotion();

  const { data, saveNote, toggleQuest } = useCityWorkspace(cityId);

  const handleSelectTool = (toolId: string) => {
    if (controlledActiveToolId === undefined) {
      setInternalActiveTool(toolId);
    }
    onSelectTool?.(toolId);
  };

  // Check if activeTool matches an agent dynamic tab
  const dynamicTab = data.dynamicTabs.find((t) => t.id === activeTool);
  const isSubToolActive =
    activeTool &&
    activeTool !== "overview" &&
    activeTool !== "city" &&
    (Boolean(dynamicTab) ||
      ["files", "notes", "sources", "browser", "quests", "terminal"].includes(activeTool));

  return (
    <div className={`w-full flex flex-col items-center select-none ${className}`}>
      {/* If a subtool is open, render a sleek minimalist sub-nav bar */}
      {isSubToolActive && (
        <div className="w-full max-w-5xl px-4 sm:px-6 pt-2 pb-4 flex items-center justify-between border-b border-white/5 mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleSelectTool("overview")}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-xs font-mono text-[#9aa5b8] hover:text-white transition-all cursor-pointer"
            >
              <CaretLeft size={14} weight="bold" />
              <span>{data.title}</span>
            </button>

            <span className="text-white/20 text-xs">/</span>

            <span className="text-xs font-mono text-[var(--accent-lime)] capitalize">
              {dynamicTab ? dynamicTab.title : activeTool}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBackToWorld}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-xs font-mono text-[#9aa5b8] hover:text-white transition-all cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>World Map</span>
            </button>

            <Badge variant="outline" className="border-[var(--accent-lime)]/30 text-[var(--accent-lime)] text-[11px] font-mono py-0 h-5">
              Lvl {data.level}
            </Badge>
          </div>
        </div>
      )}

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
            <div className="w-full max-w-5xl h-[640px] rounded-xl overflow-hidden border border-white/10 bg-[#0d1118] shadow-2xl">
              <DynamicTabContainer
                tabId={dynamicTab.id}
                cityId={cityId}
                srcdoc={dynamicTab.srcdoc}
                title={dynamicTab.title}
                className="w-full h-full"
              />
            </div>
          ) : activeTool === "files" ? (
            <div className="w-full max-w-5xl px-4 sm:px-6">
              <FilesView cityId={cityId} cityName={data.title} />
            </div>
          ) : activeTool === "notes" ? (
            <div className="w-full max-w-5xl px-4 sm:px-6">
              <NotesView notes={data.notes} cityName={data.title} onSaveNote={saveNote} />
            </div>
          ) : activeTool === "sources" || activeTool === "browser" ? (
            <div className="w-full max-w-5xl px-4 sm:px-6">
              <SourcesView sources={data.sources} cityName={data.title} />
            </div>
          ) : activeTool === "quests" ? (
            <div className="w-full max-w-5xl px-4 sm:px-6">
              <QuestsView quests={data.quests} cityName={data.title} onToggleQuest={toggleQuest} />
            </div>
          ) : activeTool === "terminal" ? (
            <div className="w-full max-w-5xl px-4 sm:px-6">
              <TerminalView
                cityId={cityId}
                cityName={data.title}
                notesCount={data.notes.length}
                sourcesCount={data.sources.length}
              />
            </div>
          ) : (
            <CityOverview
              data={data}
              onSelectTool={handleSelectTool}
              onBackToWorld={onBackToWorld}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
