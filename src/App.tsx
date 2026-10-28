import { useState, useEffect } from "react";
import { Compass, Sparkle, Cards } from "@phosphor-icons/react";
import { AppProviders } from "@/app/providers";
import { RootLayout } from "@/app/layout";
import { AgenticDock, type DockToolItem } from "@/features/dock/AgenticDock";
import { DockSurface } from "@/features/dock/DockSurface";
import { ThemeCustomizerView } from "@/features/theme/ThemeCustomizerView";
import { PluginsView } from "@/features/plugins/PluginsView";
import { WorldView, INITIAL_GLOBAL_CITIES } from "@/features/views/WorldView";
import { CityView } from "@/features/views/CityView";
import { AgentConversation } from "@/features/agent/AgentConversation";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { useThemeStore } from "@/lib/theme";
import { resolveIcon } from "@/components/icons";
import { useNavigationStore } from "@/lib/store/useNavigationStore";
import { useDockStore } from "@/lib/store/useDockStore";
import { cn } from "@/lib/cn";

export default function App() {
  const [activeToolId, setActiveToolId] = useState<string>("");
  const [extraTools, setExtraTools] = useState<DockToolItem[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("Neural Networks");

  const { viewMode, activeCityId, enterCity, exitToWorld } = useNavigationStore();
  const { setActiveTool: setDockActiveTool } = useDockStore();

  const {
    layoutState,
    sideWidth,
    isStreaming,
    isBuildingTool,
    buildingToolName,
    statusText,
    setLayoutState,
    toggleAgent,
    sendMessage,
    abortStream,
    retryLast,
  } = useConversationStore();

  const {
    wallpaperUrl,
    wallpaperFit,
    wallpaperOpacity,
    wallpaperBlur,
  } = useThemeStore();

  const handleDismissTool = (toolIdToDismiss?: string) => {
    const targetTool = toolIdToDismiss ?? activeToolId;
    setActiveToolId("");
    if (targetTool) {
      const dockBtn = document.querySelector<HTMLButtonElement>(
        `[data-dock-tool-id="${targetTool}"]`
      );
      dockBtn?.focus();
    }
  };

  const handleSelectTool = (toolId: string) => {
    if (toolId === "agent") {
      toggleAgent(activeToolId);
      return;
    }

    if (toolId === "world" || toolId === "maps") {
      if (viewMode === "city") {
        exitToWorld();
        setActiveToolId("maps");
        setDockActiveTool("maps");
        return;
      }
      const nextTool = activeToolId === "maps" ? "" : "maps";
      setActiveToolId(nextTool);
      setDockActiveTool(nextTool);
      return;
    }

    if (toolId === "settings" || toolId === "theme") {
      const nextTool = activeToolId === "settings" || activeToolId === "theme" ? "" : "settings";
      setActiveToolId(nextTool);
      setDockActiveTool(nextTool);
      return;
    }

    if (toolId === "city") {
      enterCity(selectedCity);
      setActiveToolId("");
      setDockActiveTool("");
      return;
    }

    const isWide = typeof window !== "undefined" && window.innerWidth >= 900;

    if (layoutState === "full") {
      if (isWide) {
        setLayoutState("side");
        setActiveToolId(toolId);
        setDockActiveTool(toolId);
      } else {
        setLayoutState("sheet");
        setActiveToolId(toolId);
        setDockActiveTool(toolId);
      }
      return;
    }

    if (layoutState === "side" && activeToolId === toolId) {
      setActiveToolId("");
      setDockActiveTool("");
      setLayoutState("full");
      return;
    }

    const nextTool = activeToolId === toolId ? "" : toolId;
    setActiveToolId(nextTool);
    setDockActiveTool(nextTool);
  };

  // Compelling demonstration of the dock dynamically expanding itself
  const handleSynthesizeTool = (topic = selectedCity) => {
    setExtraTools((prev) => {
      if (prev.some((t) => t.id === "flashcards")) return prev;
      return [
        ...prev,
        {
          id: "flashcards",
          label: `${topic} Flashcards`,
          type: "icon",
          icon: resolveIcon("cards"),
        },
      ];
    });
    setActiveToolId("flashcards");
    setDockActiveTool("flashcards");
  };

  const handleToolPromptSubmit = (prompt: string) => {
    const isFlashcards = prompt.toLowerCase().includes("flashcard");
    const targetCity = activeCityId || selectedCity;

    sendMessage(
      prompt,
      targetCity,
      {
        onExperienceCreated: (exp) => {
          setExtraTools((prev) => {
            if (prev.some((t) => t.id === exp.id)) return prev;
            return [
              ...prev,
              {
                id: exp.id,
                label: exp.title,
                type: "icon",
                icon: resolveIcon(exp.icon),
              },
            ];
          });
        },
        onOpenExperience: (expId) => {
          setActiveToolId(expId);
          setDockActiveTool(expId);
        },
      },
      { origin: "dock-add" }
    );

    if (isFlashcards) {
      setTimeout(() => {
        setExtraTools((prev) => {
          if (prev.some((t) => t.id === "flashcards")) return prev;
          return [
            ...prev,
            {
              id: "flashcards",
              label: `${targetCity} Flashcards`,
              type: "icon",
              icon: resolveIcon("cards"),
            },
          ];
        });
        setActiveToolId("flashcards");
        setDockActiveTool("flashcards");
      }, 600);
    }
  };



  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (layoutState === "full") {
          setLayoutState("sheet");
        } else if (layoutState === "sheet") {
          setLayoutState("closed");
        } else if (layoutState === "side") {
          if (activeToolId) {
            setActiveToolId("");
            setLayoutState("full");
          } else {
            setLayoutState("closed");
          }
        } else if (activeToolId === "theme" || activeToolId === "settings") {
          handleDismissTool(activeToolId);
        } else if (activeToolId === "maps") {
          setActiveToolId("");
          setDockActiveTool("");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layoutState, activeToolId, setLayoutState]);

  const isSideLayout = layoutState === "side";
  const isCityMode = viewMode === "city";
  const isMapsOpen = !isCityMode && activeToolId === "maps";

  return (
    <AppProviders>
      <RootLayout>
        <div className="relative min-h-screen w-full bg-background text-foreground overflow-x-hidden select-none">
          {/* Custom Wallpaper Layer */}
          {wallpaperUrl && (
            <div
              className="pointer-events-none fixed inset-0 z-0 transition-all duration-300"
              style={{
                backgroundImage: `url(${wallpaperUrl})`,
                backgroundSize:
                  wallpaperFit === "tile" ? "auto" : wallpaperFit,
                backgroundRepeat:
                  wallpaperFit === "tile" ? "repeat" : "no-repeat",
                backgroundPosition: "center",
                opacity: wallpaperOpacity,
                filter:
                  wallpaperBlur > 0 ? `blur(${wallpaperBlur}px)` : undefined,
              }}
            />
          )}

          {/* Ambient Lighting */}
          <div
            className="pointer-events-none fixed inset-0 z-0 opacity-30"
            style={{
              backgroundImage: `
                radial-gradient(circle at 50% 0%, rgba(200, 255, 87, 0.06) 0%, transparent 60%)
              `,
            }}
          />

          {/* Pinned Agentic Dock at the top edge */}
          <AgenticDock
            cityName={viewMode === "city" ? (activeCityId || selectedCity) : undefined}
            activeToolId={activeToolId}
            isAgentSheetOpen={layoutState !== "closed"}
            isAgentWorking={isStreaming}
            extraTools={extraTools}
            onSelectTool={handleSelectTool}
            onSubmitToolPrompt={handleToolPromptSubmit}
            isBuilding={isBuildingTool}
            buildingName={buildingToolName}
            statusText={statusText}
            onStopBuilding={abortStream}
            onRetryBuilding={() =>
              retryLast(activeCityId || selectedCity, {
                onExperienceCreated: (exp) => {
                  setExtraTools((prev) => {
                    if (prev.some((t) => t.id === exp.id)) return prev;
                    return [
                      ...prev,
                      {
                        id: exp.id,
                        label: exp.title,
                        type: "icon",
                        icon: resolveIcon(exp.icon),
                      },
                    ];
                  });
                },
                onOpenExperience: (expId) => {
                  setActiveToolId(expId);
                  setDockActiveTool(expId);
                },
              })
            }
          />

          {/* Single Agent Conversation Instance */}
          <AgentConversation
            cityId={selectedCity}
            onExperienceCreated={(exp) => {
              setExtraTools((prev) => {
                if (prev.some((t) => t.id === exp.id)) return prev;
                return [
                  ...prev,
                  {
                    id: exp.id,
                    label: exp.title,
                    type: "icon",
                    icon: resolveIcon(exp.icon),
                  },
                ];
              });
            }}
            onOpenExperience={(expId) => {
              setActiveToolId(expId);
            }}
          />

          {/* Main Workspace Viewport */}
          <main
            style={isSideLayout ? { marginLeft: `${sideWidth}px` } : undefined}
            className={cn(
              "relative z-10 min-h-screen w-full flex flex-col items-center transition-[margin] duration-150",
              isSideLayout && "w-[calc(100%-${sideWidth}px)] max-w-full"
            )}
          >
            {activeToolId === "settings" || activeToolId === "theme" ? (
              <DockSurface frameless>
                <ThemeCustomizerView onDismiss={() => handleDismissTool("settings")} />
              </DockSurface>
            ) : activeToolId === "plugins" ? (
              <DockSurface frameless>
                <PluginsView onDismiss={() => handleDismissTool("plugins")} />
              </DockSurface>
            ) : isCityMode ? (
              <DockSurface frameless>
                <div className="w-full">
                  <CityView
                    cityName={activeCityId || selectedCity}
                    activeToolId={activeToolId === "city" || !activeToolId ? "overview" : activeToolId}
                    onSelectTool={handleSelectTool}
                    onSynthesizeTool={handleSynthesizeTool}
                    onBackToWorld={() => {
                      exitToWorld();
                      setActiveToolId("maps");
                      setDockActiveTool("maps");
                    }}
                  />
                </div>
              </DockSurface>
            ) : !isMapsOpen ? (
              /* Ambient Root World Screen: Clean typography, no design slop */
              <DockSurface frameless>
                <div className="flex flex-col items-center justify-center text-center max-w-2xl px-4 pt-20 sm:pt-28 animate-in fade-in duration-300">
                  <h1 className="text-4xl sm:text-6xl font-semibold text-white mb-3">
                    Polymax
                  </h1>

                  <p className="text-sm sm:text-base text-[#9aa5b8] max-w-md mb-8 font-sans">
                    The Agentic Dock workspace. Open <strong className="text-white">Maps</strong> to explore territories, or press <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-xs text-white">⌘K</kbd> to converse with your Agent.
                  </p>

                  {/* Core Action Triggers */}
                  <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveToolId("maps");
                        setDockActiveTool("maps");
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-lime)] text-black font-semibold text-xs transition-opacity hover:opacity-90 cursor-pointer"
                    >
                      <Compass size={18} weight="bold" />
                      <span>Open World Map</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleAgent(activeToolId)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-white font-medium text-xs transition-colors cursor-pointer"
                    >
                      <Sparkle size={18} className="text-[var(--accent-lime)]" />
                      <span>Ask Agent (⌘K)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSynthesizeTool()}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-white font-medium text-xs transition-colors cursor-pointer"
                    >
                      <Cards size={18} className="text-[var(--accent-lime)]" />
                      <span>Demo: Synthesize Tool</span>
                    </button>
                  </div>

                  {/* Cities List */}
                  <div className="flex flex-col items-center gap-2.5 w-full max-w-lg">
                    <span className="text-xs text-[#9aa5b8]">
                      Discovered Cities
                    </span>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {INITIAL_GLOBAL_CITIES.map((city) => (
                        <button
                          key={city.id}
                          type="button"
                          onClick={() => {
                            setSelectedCity(city.title);
                            enterCity(city.title);
                            setActiveToolId("");
                            setDockActiveTool("");
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs font-sans text-[#d1d6e2] hover:text-white transition-colors cursor-pointer"
                        >
                          {city.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </DockSurface>
            ) : null}

            {/* Living World Map */}
            {isMapsOpen && (
              <div className="fixed inset-0 z-0 w-full h-full animate-in fade-in duration-300">
                <WorldView
                  activeCityId={undefined}
                  onEnterCity={(cityName) => {
                    setSelectedCity(cityName);
                    enterCity(cityName);
                    setActiveToolId("");
                    setDockActiveTool("");
                  }}
                  onFoundCityTopic={(_topic) => {
                    setLayoutState("sheet");
                  }}
                />
              </div>
            )}
          </main>
        </div>
      </RootLayout>
    </AppProviders>
  );
}
