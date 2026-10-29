import { useState, useEffect, useRef, useMemo } from "react";
import { DynamicTabContainer } from "@/features/dock/DynamicTabContainer";
import { TabHost, type KeptTab } from "@/features/dock/TabHost";
import { useCityWorkspace } from "./useCityWorkspace";
import { CityOverview } from "./CityOverview";
import { getLastCityTool } from "@/lib/city/cityModel";
import { useCitySummaryStore } from "@/lib/store/useCitySummaryStore";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { NotesView } from "./tools/NotesView";
import { SourcesView } from "./tools/SourcesView";
import { SourceDetailView } from "./tools/SourceDetailView";
import { QuestsView } from "./tools/QuestsView";
import { TerminalView } from "./tools/TerminalView";
import { FilesView } from "./tools/FilesView";
import { FlashcardsView } from "./FlashcardsView";
import { PluginsView } from "@/features/plugins/PluginsView";
import type { CityWorkspaceProps } from "./types";

type ExtendedCityWorkspaceProps = CityWorkspaceProps & {
  secondaryToolId?: string | null;
};

export function CityWorkspace({
  cityId,
  activeToolId: controlledActiveToolId,
  secondaryToolId = null,
  onSelectTool,
  className = "",
}: ExtendedCityWorkspaceProps) {
  const [internalActiveTool, setInternalActiveTool] = useState<string>("overview");
  const activeTool = controlledActiveToolId ?? internalActiveTool;

  const { data, loading, saveNote, toggleQuest, openSource } = useCityWorkspace(cityId);
  const readerView = useConversationStore((s) => s.readerView);
  const openedSourceId = readerView?.cityId === cityId ? (readerView.sourceId ?? readerView.url) : null;

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

  // An agent-opened source surfaces in this city's Sources area (same
  // surface as a feed click), so it stays visible wherever the user is.
  const lastSurfacedRef = useRef<string | null>(null);
  useEffect(() => {
    if (openedSourceId && lastSurfacedRef.current !== openedSourceId) {
      lastSurfacedRef.current = openedSourceId;
      if (activeTool !== "sources" && activeTool !== "browser") handleSelectTool("sources");
    }
    if (!openedSourceId) lastSurfacedRef.current = null;
    // handleSelectTool is stable by construction (setState + optional callback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedSourceId, activeTool]);

  // Check if activeTool matches an agent dynamic tab
  const dynamicTab = data.dynamicTabs.find((t) => t.id === activeTool);

  // Platform tab lifecycle: every city surface stays mounted; the host
  // shows the active one and hides the rest (0 remounts on return).
  // Per-tool UI state persists via useTabState inside each view.
  const toolTabs: KeptTab[] = useMemo(
    () => [
      {
        id: "overview",
        render: () => <CityOverview data={data} isFirstVisit={!getLastCityTool(cityId)} />,
      },
      ...data.dynamicTabs.map((t) => ({
        id: `dyn:${t.id}`,
        render: () => (
          <div className="w-full max-w-5xl h-[640px] rounded-2xl overflow-hidden bg-transparent">
            <DynamicTabContainer
              tabId={t.id}
              cityId={cityId}
              srcdoc={t.srcdoc}
              title={t.title}
              className="w-full h-full"
            />
          </div>
        ),
      })),
      {
        id: "flashcards",
        render: () => <FlashcardsView cityName={data.title} cityKey={cityId} sources={data.sources} />,
      },
      {
        id: "files",
        render: () => <FilesView cityId={cityId} cityName={data.title} />,
      },
      {
        id: "notes",
        render: () => (
          <NotesView notes={data.notes} cityName={data.title} cityKey={cityId} onSaveNote={saveNote} />
        ),
      },
      {
        id: "sources",
        render: () => (
          <>
            <div
              hidden={!!(openedSourceId && readerView)}
              className={openedSourceId && readerView ? undefined : "contents"}
            >
              <SourcesView
                sources={data.sources}
                cityName={data.title}
                cityKey={cityId}
                loading={loading}
                onOpen={(id) => void openSource(id)}
              />
            </div>
            {openedSourceId && readerView && <SourceDetailView view={readerView} />}
          </>
        ),
      },
      {
        id: "quests",
        render: () => (
          <QuestsView quests={data.quests} cityName={data.title} onToggleQuest={toggleQuest} />
        ),
      },
      {
        id: "terminal",
        render: () => (
          <TerminalView
            cityId={cityId}
            cityName={data.title}
            notesCount={data.notes.length}
            sourcesCount={data.sources.length}
          />
        ),
      },
      {
        id: "plugins",
        render: () => <PluginsView onDismiss={() => handleSelectTool("overview")} />,
      },
    ],
    // handleSelectTool excluded: stable by construction (setState + optional callback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, loading, cityId, openedSourceId, readerView, saveNote, toggleQuest, openSource]
  );
  const visibleTabId = dynamicTab
    ? `dyn:${dynamicTab.id}`
    : activeTool === "browser"
      ? "sources"
      : activeTool || "overview";
  const secondaryVisibleId = secondaryToolId
    ? secondaryToolId === "browser"
      ? "sources"
      : secondaryToolId
    : null;
  const dual = Boolean(secondaryVisibleId && secondaryVisibleId !== visibleTabId);

  return (
    <div className={`w-full flex flex-col items-center select-none ${className}`}>
      {/* Host-owned mount: all tools stay mounted, inactive ones hidden.
          Dual panels show two records side by side; nothing remounts. */}
      <div className={dual ? "w-full flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start" : "w-full flex-1 flex flex-col items-center"}>
        <TabHost activeId={visibleTabId} secondaryId={dual ? secondaryVisibleId : null} tabs={toolTabs} />
      </div>
    </div>
  );
}
