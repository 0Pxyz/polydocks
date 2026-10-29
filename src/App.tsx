import { useState, useEffect } from "react";
import { AppProviders } from "@/app/providers";
import { RootLayout } from "@/app/layout";
import { AgenticDock, type DockToolItem } from "@/features/dock/AgenticDock";
import { DockSurface } from "@/features/dock/DockSurface";
import { ThemeCustomizerView } from "@/features/theme/ThemeCustomizerView";
import { PluginsView } from "@/features/plugins/PluginsView";
import { PluginStoreView } from "@/features/plugins/PluginStoreView";
import { DynamicPluginSandbox } from "@/features/dock/DynamicPluginSandbox";
import { HomeScreen } from "@/features/home/HomeScreen";
import { OnboardingModal } from "@/features/onboarding/OnboardingModal";
import { WorldView } from "@/features/views/WorldView";
import { CityView } from "@/features/views/CityView";
import { AgentConversation } from "@/features/agent/AgentConversation";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { useThemeStore } from "@/lib/theme";
import { resolveIcon } from "@/components/icons";
import { useNavigationStore } from "@/lib/store/useNavigationStore";
import { useDockStore } from "@/lib/store/useDockStore";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";
import { cn } from "@/lib/cn";

export default function App() {
  const [activeToolId, setActiveToolId] = useState<string>("");
  const [extraTools, setExtraTools] = useState<DockToolItem[]>([]);
  const [selectedCity, setSelectedCity] = useState<string | undefined>(undefined);

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
    hydrateThread,
  } = useConversationStore();

  const {
    wallpaperUrl,
    wallpaperFit,
    wallpaperOpacity,
    wallpaperBlur,
  } = useThemeStore();

  const { workspacePlugins } = useWorkspaceStore();

  const workspaceDockTools: DockToolItem[] = workspacePlugins
    .filter((wp) => wp.enabled && wp.plugin)
    .map((wp) => ({
      id: wp.pluginId,
      label: wp.plugin?.name || wp.pluginId,
      type: "icon",
      icon: resolveIcon(wp.plugin?.icon || "Cards"),
      iconKey: wp.plugin?.icon || wp.pluginId,
    }));

  // The Plugin Store is not a dock item: store plugins are reachable only
  // through dock search, which installs and opens them directly.
  const activeExtraTools = [
    ...extraTools.filter((t) => t.id !== "store"),
    ...workspaceDockTools.filter((wt) => wt.id !== "store" && !extraTools.some((et) => et.id === wt.id)),
  ];

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

  // Agent-driven close: dismiss the open view without deleting anything.
  const handleCloseExperience = (expId: string) => {
    if (expId === "agent") {
      setLayoutState("closed");
      return;
    }
    if (activeToolId === expId) {
      setActiveToolId("");
      setDockActiveTool("");
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
      if (selectedCity) {
        enterCity(selectedCity);
      }
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
  const handleSynthesizeTool = (topic = selectedCity || "General") => {
    setExtraTools((prev) => {
      if (prev.some((t) => t.id === "flashcards")) return prev;
      return [
        ...prev,
        {
          id: "flashcards",
          label: `${topic} Flashcards`,
          type: "icon",
          icon: resolveIcon("cards"),
          iconKey: "cards",
        },
      ];
    });
    setActiveToolId("flashcards");
    setDockActiveTool("flashcards");
  };

  const handleToolPromptSubmit = (prompt: string, meta?: Record<string, unknown>) => {
    const isFlashcards = prompt.toLowerCase().includes("flashcard");
    const targetCity = viewMode === "city" ? (activeCityId || selectedCity) : undefined;

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
                iconKey: exp.icon,
              },
            ];
          });
        },
        onOpenExperience: (expId) => {
          setActiveToolId(expId);
          setDockActiveTool(expId);
        },
        onCloseExperience: handleCloseExperience,
      },
      meta || { origin: "dock-add" }
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
              iconKey: "cards",
            },
          ];
        });
        setActiveToolId("flashcards");
        setDockActiveTool("flashcards");
      }, 600);
    }
  };



  useEffect(() => {
    // Mirror the focused tool into the shared dock layer so the bar, the
    // search palette and the agent all read the same open state.
    const dock = useDockStore.getState();
    if (activeToolId && activeToolId !== "agent") {
      dock.openTool(activeToolId);
    } else if (!activeToolId && dock.openIds.length > 0) {
      dock.closeTool(dock.openIds[0]);
    }
  }, [activeToolId]);

  useEffect(() => {
    // Restore the single persistent thread once per session. Layout changes
    // never re-fetch it and no conversation list is created.
    void hydrateThread();
  }, [hydrateThread]);

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
        <div className="relative min-h-screen w-full bg-background text-foreground overflow-x-hidden select-none flex flex-col">
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
            extraTools={activeExtraTools}
            sessionTools={extraTools}
            onSelectTool={handleSelectTool}
            onCloseItem={(toolId) => {
              if (toolId === "agent") {
                setLayoutState("closed");
                return;
              }
              if (activeToolId === toolId) {
                setActiveToolId("");
                setDockActiveTool("");
              }
            }}
            onSubmitToolPrompt={(prompt) => handleToolPromptSubmit(prompt)}
            onFixWithAgent={(prompt) => {
              handleToolPromptSubmit(prompt, { origin: "dock-fix" });
              const isWide = typeof window !== "undefined" && window.innerWidth >= 900;
              setLayoutState(isWide ? "side" : "sheet");
            }}
            onOpenAgent={() => {
              setActiveToolId("agent");
              setDockActiveTool("agent");
            }}
            onOpenInstallUrl={() => {
              setActiveToolId("plugins");
              setDockActiveTool("plugins");
            }}
            onOpenMcpConnect={() => {
              setActiveToolId("plugins");
              setDockActiveTool("plugins");
            }}
            isBuilding={isBuildingTool}
            buildingName={buildingToolName}
            statusText={statusText}
            onStopBuilding={abortStream}
            onRetryBuilding={() =>
              retryLast(viewMode === "city" ? (activeCityId || selectedCity) : undefined, {
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
                        iconKey: exp.icon,
                      },
                    ];
                  });
                },
                onOpenExperience: (expId) => {
                  setActiveToolId(expId);
                  setDockActiveTool(expId);
                },
                onCloseExperience: handleCloseExperience,
              })
            }
          />

          {/* First-launch Guided Onboarding */}
          <OnboardingModal />

          {/* Single Agent Conversation Instance */}
          <AgentConversation
            cityId={viewMode === "city" ? (activeCityId || selectedCity) : undefined}
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
                    iconKey: exp.icon,
                  },
                ];
              });
            }}
            onOpenExperience={(expId) => {
              setActiveToolId(expId);
            }}
              onCloseExperience={(expId) => {
                if (activeToolId === expId) setActiveToolId("");
              }}
          />

          {/* Main Workspace Viewport */}
          <main
            style={isSideLayout ? { marginLeft: `${sideWidth}px` } : undefined}
            className={cn(
              "relative z-10 w-full flex-1 flex flex-col items-center transition-[margin] duration-150",
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
            ) : activeToolId === "store" ? (
              <DockSurface frameless>
                <PluginStoreView
                  onDismiss={() => handleDismissTool("store")}
                  onOpenPlugin={(pluginId) => {
                    setActiveToolId(pluginId);
                    setDockActiveTool(pluginId);
                  }}
                />
              </DockSurface>
            ) : activeExtraTools.some((t) => t.id === activeToolId) ? (
              <DockSurface variant="immersive">
                <DynamicPluginSandbox
                  pluginId={activeToolId}
                  title={activeExtraTools.find((t) => t.id === activeToolId)?.label}
                  onDismiss={() => handleDismissTool(activeToolId)}
                  onAskAgentFix={(errorMsg) => {
                    handleToolPromptSubmit(`Fix tool "${activeToolId}": ${errorMsg}`, {
                      origin: "dock-fix",
                    });
                  }}
                />
              </DockSurface>
            ) : isCityMode ? (
              <DockSurface frameless>
                <div className="w-full">
                  <CityView
                    cityName={activeCityId || selectedCity || "workspace"}
                    activeToolId={activeToolId === "city" || !activeToolId ? "overview" : activeToolId}
                    onSelectTool={handleSelectTool}
                    onSynthesizeTool={handleSynthesizeTool}
                    onBackToWorld={() => {
                      exitToWorld();
                      setSelectedCity(undefined);
                      setActiveToolId("maps");
                      setDockActiveTool("maps");
                    }}
                  />
                </div>
              </DockSurface>
            ) : !isMapsOpen ? (
              <DockSurface frameless>
                <HomeScreen
                  onSendMessage={(prompt, meta) => {
                    handleToolPromptSubmit(prompt, meta);
                    const isWide = typeof window !== "undefined" && window.innerWidth >= 900;
                    setLayoutState(isWide ? "side" : "sheet");
                  }}
                  onEnterCity={(cityName) => {
                    setSelectedCity(cityName);
                    enterCity(cityName);
                    setActiveToolId("");
                    setDockActiveTool("");
                  }}
                />
              </DockSurface>
            ) : null}

            {/* Living World Map */}
            {isMapsOpen && (
              <div className="fixed inset-0 z-0 w-full h-full animate-in fade-in duration-300">
                <WorldView
                  activeCityId={undefined}
                  onEnterCity={(cityName, cityId) => {
                    const id = cityId || cityName;
                    setSelectedCity(id);
                    enterCity(id);
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
