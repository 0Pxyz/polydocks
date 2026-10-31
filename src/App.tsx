import { useState, useEffect, useMemo } from "react";
import { AppProviders } from "@/app/providers";
import { RootLayout } from "@/app/layout";
import { AgenticDock, type DockToolItem } from "@/features/dock/AgenticDock";
import { DockSurface } from "@/features/dock/DockSurface";
import { ThemeCustomizerView } from "@/features/theme/ThemeCustomizerView";
import { PluginsView } from "@/features/plugins/PluginsView";
import { PluginStoreView } from "@/features/plugins/PluginStoreView";
import { DynamicPluginSandbox } from "@/features/dock/DynamicPluginSandbox";
import { HomeScreen } from "@/features/home/HomeScreen";
import { NativeBrowserView } from "@/features/browser/NativeBrowserView";
import { OnboardingModal } from "@/features/onboarding/OnboardingModal";
import { WorldView } from "@/features/views/WorldView";
import { CityView } from "@/features/views/CityView";
import { AgentConversation } from "@/features/agent/AgentConversation";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { useThemeStore } from "@/lib/theme";
import { resolveIcon } from "@/components/icons";
import { useNavigationStore } from "@/lib/store/useNavigationStore";
import { useDockStore } from "@/lib/store/useDockStore";
import { useTabHostStore } from "@/lib/tabs/tabHostStore";
import { TabHost } from "@/features/dock/TabHost";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";
import { buildCityDockTools } from "@/lib/dock/dockModel";
import { matchDockShortcut, TWO_PANEL_MIN_WIDTH } from "@/lib/dock/dockItems";
import { useCitySummaryStore } from "@/lib/store/useCitySummaryStore";
import { cn } from "@/lib/cn";

export default function App() {
  const [activeToolId, setActiveToolId] = useState<string>("");
  const [pluginsInitialTab] = useState<"installed" | "discover">("installed");
  const [extraTools, setExtraTools] = useState<DockToolItem[]>([]);
  const [selectedCity, setSelectedCity] = useState<string | undefined>(undefined);

  const { viewMode, activeCityId, enterCity, exitToWorld } = useNavigationStore();
  const { setActiveTool: setDockActiveTool } = useDockStore();
  const hostTabs = useTabHostStore((s) => s.tabs);

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
    requestVoiceStart,
  } = useConversationStore();

  const {
    wallpaperUrl,
    wallpaperFit,
    wallpaperOpacity,
    wallpaperBlur,
  } = useThemeStore();

  const { workspacePlugins, fetchWorkspaces } = useWorkspaceStore();

  // Home reflects installed plugins dynamically: the workspace registry (not
  // a hardcoded list) drives the home grid. Fresh workspaces show an honest
  // empty state with Discover; nothing is auto-installed.
  useEffect(() => {
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Memoized: fresh arrays every render would retrigger the tab-host
  // registration effect below and loop openTab -> rerender forever.
  const workspaceDockTools: DockToolItem[] = useMemo(
    () =>
      workspacePlugins
        .filter((wp) => wp.enabled && wp.plugin)
        .map((wp) => ({
          id: wp.pluginId,
          label: wp.plugin?.name || wp.pluginId,
          type: "icon",
          icon: resolveIcon(wp.plugin?.icon || "Cards"),
          iconKey: wp.plugin?.icon || wp.pluginId,
        })),
    [workspacePlugins]
  );

  // The Plugin Store is not a dock item: store plugins are reachable only
  // through dock search, which installs and opens them directly.
  const activeExtraTools = useMemo(
    () => [
      ...extraTools.filter((t) => t.id !== "store"),
      ...workspaceDockTools.filter((wt) => wt.id !== "store" && !extraTools.some((et) => et.id === wt.id)),
    ],
    [extraTools, workspaceDockTools]
  );

  const handleDismissTool = (toolIdToDismiss?: string) => {
    const targetTool = toolIdToDismiss ?? activeToolId;
    // Explicit dismiss destroys the tab runtime (reopen mounts fresh);
    // toggling via the dock merely hides it (state kept).
    if (targetTool && activeExtraTools.some((t) => t.id === targetTool)) {
      useTabHostStore.getState().closeTab(targetTool);
    }
    // Single source: the store owns focus. Close there and mirror locally.
    if (targetTool) {
      useDockStore.getState().closeTool(targetTool);
      setActiveToolId(useDockStore.getState().dock.focusedId ?? "");
    } else {
      setActiveToolId("");
    }
    if (targetTool) {
      const dockBtn = document.querySelector<HTMLButtonElement>(
        `[data-dock-tool-id="${targetTool}"]`
      );
      dockBtn?.focus();
    }
  };

  // Agent-driven close: dismiss the open view without deleting anything.
  // The store owns focus; local state mirrors it.
  const handleCloseExperience = (expId: string) => {
    if (expId === "agent") {
      setLayoutState("closed");
      return;
    }
    const dock = useDockStore.getState();
    if (activeToolId === expId) {
      dock.closeTool(expId);
      setActiveToolId(dock.dock.focusedId ?? "");
    } else if (dock.dock.items[expId] && dock.dock.items[expId].state !== "closed") {
      dock.closeTool(expId);
    }
  };

  const handleSelectTool = (toolId: string) => {
    if (toolId === "agent") {
      // Single source of truth for the glyph: the dock icon is active
      // exactly while the panel is open. Never leave a stale "agent"
      // active id behind a closed panel.
      const wasOpen = layoutState !== "closed";
      toggleAgent(activeToolId);
      if (wasOpen && activeToolId === "agent") {
        setActiveToolId("");
        setDockActiveTool("");
      }
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
      // Focus follows the context switch (per-context memory restores the
      // city's tool); never blank the store here.
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



  // Local state mirrors the single source (the dock store). One direction
  // only: the store owns focus, this effect copies it locally. The reverse
  // mirror (local -> store) was removed: it chased stale closures against
  // this effect and looped close/open forever (Maximum update depth).

  useEffect(() => {
    // Host-owned lifecycle: selecting a dynamic plugin tab mounts it once.
    // The TabHost below keeps it mounted but hidden afterwards, so
    // returning to it is 0 remounts; hibernated tabs restore on reopen.
    // The live-status guard plus the memoized list above keep this from
    // retriggering on every render (which would loop openTab forever).
    if (
      activeToolId &&
      activeExtraTools.some((t) => t.id === activeToolId) &&
      hostTabs[activeToolId]?.status !== "live"
    ) {
      useTabHostStore.getState().openTab(activeToolId, "plugin");
    }
  }, [activeToolId, activeExtraTools, hostTabs]);

  const cityId = viewMode === "city" ? activeCityId || selectedCity : undefined;
  const citySummary = useCitySummaryStore((s) => (cityId ? s.summaries[cityId] : undefined));

  // Active context is opaque to the core: city id or null (map). Records
  // persist across switches; visibility filters globals + active context.
  // Focus is remembered per context, so map -> city restores order + focus.
  useEffect(() => {
    useDockStore.getState().setActiveContext(cityId ?? null);
  }, [cityId]);

  // Keep the local focus mirror in sync when the dock changes underneath
  // (keyboard, REST, CLI, agent verbs share the same registry).
  const dockFocusedId = useDockStore((s) => s.dock.focusedId);
  useEffect(() => {
    if ((dockFocusedId ?? "") !== activeToolId) {
      setActiveToolId(dockFocusedId ?? "");
    }
  }, [dockFocusedId]);

  // City tools live in the dock while inside a city (contextual, never
  // pinned globally) with live badges from real workspace counts.
  // No per-view duplicate state: the dock record is the source; the
  // per-city focus memory restores the same tool on return.
  const cityTools: DockToolItem[] = useMemo(
    () =>
      buildCityDockTools(citySummary).map(
        (item): DockToolItem => ({
          id: item.id,
          label: item.label,
          type: "icon",
          iconKey: item.icon,
          badge: item.badge,
          tooltipDetail: item.tooltipDetail,
        })
      ),
    [citySummary]
  );
  const cityToolIds = useMemo(() => cityTools.map((t) => t.id), [cityTools]);

  useEffect(() => {
    // Restore the single persistent thread once per session. Layout changes
    // never re-fetch it and no conversation list is created.
    void hydrateThread();
  }, [hydrateThread]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Single registry: Ctrl/Cmd+Shift + code. event.code, never event.key.
      const matched = matchDockShortcut({
        code: e.code,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      });
      if (matched) {
        const dock = useDockStore.getState();
        if (matched.action.id === "tabs.focus") {
          e.preventDefault();
          dock.focusByIndex(matched.index ?? 0);
          return;
        }
        if (matched.action.id === "tabs.next") {
          e.preventDefault();
          dock.focusNext(1);
          return;
        }
        if (matched.action.id === "tabs.prev") {
          e.preventDefault();
          dock.focusNext(-1);
          return;
        }
        if (matched.action.id === "tabs.close") {
          // Never close the chat via W when typing inside it: the chat
          // owns its own keys; the dock shortcut applies outside inputs.
          const target = (e.target as HTMLElement | null)?.tagName;
          if (target === "INPUT" || target === "TEXTAREA") return;
          e.preventDefault();
          dock.runDockAction("tabs.close");
          return;
        }
        if (matched.action.id === "tabs.background") {
          e.preventDefault();
          dock.runDockAction("tabs.background");
          return;
        }
        if (matched.action.id === "chat.toggle") {
          e.preventDefault();
          dock.runDockAction("chat.toggle");
          const focused = useDockStore.getState().dock.focusedId;
          if (focused === "agent") {
            const isWide = typeof window !== "undefined" && window.innerWidth >= 900;
            setLayoutState(isWide ? "side" : "sheet");
          }
          return;
        }
      }
      if (e.key === "Escape") {
        // Return focus to the home orb when the chat panel closes, so
        // keyboard users land back where they started (no-op when home
        // is not mounted).
        const returnFocusToOrb = () => {
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>("[data-home-orb]")?.focus();
          });
        };
        if (layoutState === "full") {
          setLayoutState("sheet");
        } else if (layoutState === "sheet") {
          setLayoutState("closed");
          if (activeToolId === "agent") {
            setActiveToolId("");
            setDockActiveTool("");
          }
          returnFocusToOrb();
        } else if (layoutState === "side") {
          if (activeToolId) {
            setActiveToolId("");
            setLayoutState("full");
          } else {
            setLayoutState("closed");
            returnFocusToOrb();
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

  // Two panels side by side at sufficient width; otherwise single panel.
  // Nothing unmounts: the host keeps every record mounted, hidden via CSS.
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const dockSnapshot = useDockStore((s) => s.dock);
  const secondaryToolId = useMemo(() => {
    if (!isCityMode || viewportWidth < TWO_PANEL_MIN_WIDTH) return null;
    const visible = dockSnapshot.order.filter((id) => {
      const record = dockSnapshot.items[id];
      return (
        record &&
        (record.contextId === null || record.contextId === dockSnapshot.activeContextId) &&
        (record.state === "open" || record.state === "focused")
      );
    });
    if (visible.length < 2) return null;
    const focused = dockSnapshot.focusedId && visible.includes(dockSnapshot.focusedId)
      ? dockSnapshot.focusedId
      : visible[0];
    const others = visible.filter((id) => id !== focused);
    others.sort((a, b) => (dockSnapshot.items[b]?.updatedAt ?? 0) - (dockSnapshot.items[a]?.updatedAt ?? 0));
    return others[0] ?? null;
  }, [isCityMode, viewportWidth, dockSnapshot]);
  useEffect(() => {
    useDockStore.getState().layoutPanels(viewportWidth);
  }, [viewportWidth, dockSnapshot.focusedId, dockSnapshot.activeContextId]);

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
            tools={isCityMode ? cityTools : undefined}
            contextualIds={isCityMode ? cityToolIds : undefined}
            onSelectTool={handleSelectTool}
            onCloseItem={(toolId) => {
              if (toolId === "agent") {
                setLayoutState("closed");
                if (activeToolId === "agent") {
                  setActiveToolId("");
                  setDockActiveTool("");
                }
                return;
              }
              // Single source: close in the store, mirror locally.
              const dock = useDockStore.getState();
              dock.closeTool(toolId);
              setActiveToolId(dock.dock.focusedId ?? "");
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
              // Single source: register in the store, mirror locally.
              useDockStore.getState().openTool(expId);
              setActiveToolId(useDockStore.getState().dock.focusedId ?? expId);
            }}
              onCloseExperience={(expId) => {
                const dock = useDockStore.getState();
                dock.closeTool(expId);
                setActiveToolId(dock.dock.focusedId ?? "");
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
                <PluginsView
                  key={pluginsInitialTab}
                  initialTab={pluginsInitialTab}
                  onOpenPlugin={(id) => handleSelectTool(id)}
                  onDismiss={() => handleDismissTool("plugins")}
                />
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
                <TabHost
                  activeId={activeToolId}
                  tabs={activeExtraTools
                    .filter((t) => hostTabs[t.id]?.status === "live")
                    .map((t) => ({
                      id: t.id,
                      render: () => (
                        <DynamicPluginSandbox
                          pluginId={t.id}
                          title={t.label}
                          onDismiss={() => handleDismissTool(t.id)}
                          onAskAgentFix={(errorMsg) => {
                            handleToolPromptSubmit(`Fix tool "${t.id}": ${errorMsg}`, {
                              origin: "dock-fix",
                            });
                          }}
                        />
                      ),
                    }))}
                />
              </DockSurface>
            ) : isCityMode ? (
              <DockSurface frameless className={activeToolId === "browser" ? "pb-0" : undefined}>
                <div className="w-full">
                  <CityView
                    cityName={activeCityId || selectedCity || "workspace"}
                    activeToolId={!activeToolId ? "" : activeToolId}
                    secondaryToolId={secondaryToolId}
                    onSelectTool={handleSelectTool}
                  />
                </div>
              </DockSurface>
            ) : activeToolId === "browser" && !isCityMode ? (
              <DockSurface frameless className="pb-0">
                <div className="w-full flex-1 min-w-0 flex flex-col min-h-0">
                  <NativeBrowserView workspaceKey="home" />
                </div>
              </DockSurface>
            ) : !isMapsOpen ? (
              <DockSurface frameless>
                <HomeScreen
                  onOpenAgent={() => {
                    const isWide = typeof window !== "undefined" && window.innerWidth >= 900;
                    setActiveToolId("agent");
                    setDockActiveTool("agent");
                    setLayoutState(isWide ? "side" : "sheet");
                    // The home orb is the voice button: open and start listening.
                    requestVoiceStart();
                  }}
                  panelOpen={layoutState !== "closed"}
                  onCancelJobs={abortStream}
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
