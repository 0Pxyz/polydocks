import { useState, useEffect } from "react";
import { Compass, Sparkle, Sliders } from "@phosphor-icons/react";
import { AppProviders } from "@/app/providers";
import { RootLayout } from "@/app/layout";
import { AgenticDock, type DockToolItem } from "@/features/dock/AgenticDock";
import { DockSurface } from "@/features/dock/DockSurface";
import { ThemeCustomizerView } from "@/features/theme/ThemeCustomizerView";
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
    setLayoutState,
    toggleAgent,
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
      // In world view, toggling "maps"
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

    // If chat is full and a tool is clicked, split to side
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

    // If chat is in side mode and same tool is re-clicked, close tool and chat goes to full
    if (layoutState === "side" && activeToolId === toolId) {
      setActiveToolId("");
      setDockActiveTool("");
      setLayoutState("full");
      return;
    }

    // Toggle tool selection normally
    const nextTool = activeToolId === toolId ? "" : toolId;
    setActiveToolId(nextTool);
    setDockActiveTool(nextTool);
  };

  const handleAddAction = (action: "synthesize_tool" | "create_file" | "create_note" | "add_flashcards") => {
    switch (action) {
      case "synthesize_tool":
        setLayoutState("sheet");
        break;
      case "create_file":
        setActiveToolId("files");
        setDockActiveTool("files");
        break;
      case "create_note":
        setActiveToolId("notes");
        setDockActiveTool("notes");
        break;
      case "add_flashcards":
        setExtraTools((prev) => {
          if (prev.some((t) => t.id === "flashcards")) return prev;
          return [
            ...prev,
            {
              id: "flashcards",
              label: "Flashcards & Drills",
              type: "icon",
              icon: resolveIcon("cards"),
            },
          ];
        });
        setActiveToolId("flashcards");
        setDockActiveTool("flashcards");
        break;
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
          {/* Custom Wallpaper Layer (Image / GIF) */}
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

          {/* Ambient lighting & subtle grid pattern */}
          <div
            className="pointer-events-none fixed inset-0 z-0 opacity-40"
            style={{
              backgroundImage: `
                radial-gradient(circle at 50% 0%, rgba(200, 255, 87, 0.08) 0%, transparent 60%),
                linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
              `,
              backgroundSize: "100% 100%, 32px 32px, 32px 32px",
            }}
          />

          {/* Pinned Agentic Dock at the top edge of the screen */}
          <AgenticDock
            mode={isCityMode ? "city" : "world"}
            activeToolId={activeToolId}
            isAgentSheetOpen={layoutState !== "closed"}
            isAgentWorking={isStreaming}
            extraTools={extraTools}
            onSelectTool={handleSelectTool}
            onAddAction={handleAddAction}
          />

          {/* Single Agent Conversation Instance (Never unmounted; survives layout transitions) */}
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

          {/* Main Active Workspace Content (rendered side-by-side or full width) */}
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
            ) : isCityMode ? (
              <DockSurface>
                <div className="w-full max-w-5xl">
                  <CityView
                    cityName={activeCityId || selectedCity}
                    activeToolId={activeToolId === "city" || !activeToolId ? "overview" : activeToolId}
                    onSelectTool={handleSelectTool}
                    onBackToWorld={() => {
                      exitToWorld();
                      setActiveToolId("maps");
                      setDockActiveTool("maps");
                    }}
                  />
                </div>
              </DockSurface>
            ) : !isMapsOpen ? (
              /* Ambient Root World Screen: Clean ambient canvas with quick navigation pills */
              <DockSurface frameless>
                <div className="flex flex-col items-center justify-center text-center max-w-2xl px-4 pt-16 sm:pt-24 animate-in fade-in duration-300">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-xs font-mono text-[var(--accent-lime)] mb-6 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-lime)] animate-ping" />
                    <span>Agentic Dock Workspace</span>
                  </div>

                  <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-4 drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]">
                    Polymax
                  </h1>

                  <p className="text-sm sm:text-base text-[#9aa5b8] max-w-lg mb-8 leading-relaxed font-sans">
                    The Dock IS the workspace. Open <strong className="text-white">Maps</strong> from the dock to explore territories, or press <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-xs text-white">⌘K</kbd> to converse with your Agent.
                  </p>

                  {/* Quick Action Pills */}
                  <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveToolId("maps");
                        setDockActiveTool("maps");
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-lime)] text-black font-semibold text-xs transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(200,255,87,0.4)] cursor-pointer"
                    >
                      <Compass size={18} weight="bold" />
                      <span>Open World Map</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleAgent(activeToolId)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/[0.05] text-white font-medium text-xs hover:bg-white/[0.1] hover:border-white/30 transition-all cursor-pointer"
                    >
                      <Sparkle size={18} weight="duotone" className="text-[var(--accent-lime)]" />
                      <span>Ask Agent (⌘K)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveToolId("settings");
                        setDockActiveTool("settings");
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/[0.05] text-[#d1d6e2] font-medium text-xs hover:text-white hover:bg-white/[0.1] transition-all cursor-pointer"
                    >
                      <Sliders size={18} weight="duotone" />
                      <span>Themes & Settings</span>
                    </button>
                  </div>

                  {/* Direct Jump to Discovered Cities */}
                  <div className="flex flex-col items-center gap-3 w-full max-w-lg">
                    <span className="text-[11px] font-mono text-[#9aa5b8] uppercase tracking-wider">
                      Explore Discovered Cities
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
                          className="px-3 py-1.5 rounded-lg border border-white/10 bg-[#101520]/80 hover:bg-white/[0.08] hover:border-[var(--accent-lime)]/40 text-xs font-mono text-[#d1d6e2] hover:text-white transition-all cursor-pointer"
                        >
                          {city.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </DockSurface>
            ) : null}

            {/* Living World/Map View is rendered when Maps is selected from the dock */}
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
