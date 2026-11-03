import { useState, useEffect, useMemo } from "react";
import { AppProviders } from "@/app/providers";
import { RootLayout } from "@/app/layout";
import { AgenticDock, type DockToolItem } from "@/features/dock/AgenticDock";
import { DockSurface } from "@/features/dock/DockSurface";
import { DynamicPluginSandbox } from "@/features/dock/DynamicPluginSandbox";
import { HomeScreen } from "@/features/home/HomeScreen";
import { AgentConversation } from "@/features/agent/AgentConversation";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { useThemeStore } from "@/lib/theme";
import { resolveIcon } from "@/components/icons";
import { useDockStore, loadBeside } from "@/lib/store/useDockStore";
import { useTabHostStore } from "@/lib/tabs/tabHostStore";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";
import { ToolSurface } from "@/features/dock/ToolSurface";
import { BesidePanel, type BesideTab } from "@/features/dock/BesidePanel";
import { LiveOnboarding } from "@/features/onboarding/LiveOnboarding";
import {
  matchDockShortcut,
  panelLayout,
  isBesideEligible,
  shouldYieldEscToMedia,
  chatPlacement,
} from "@/lib/dock/dockItems";
import { DOCK_CORE_CATALOG, MAIN_VIEW_STATIC_IDS } from "@/lib/dock/dockModel";
import { platformStorage } from "@/lib/platform/storage";
import { cn } from "@/lib/cn";

const EXTRA_TOOLS_KEY = "polymax-extra-tools-v1";

interface PersistedExtraTool {
  id: string;
  label: string;
  iconKey?: string;
}

/**
 * Session tools (agent-built, this profile) survive a refresh (#382):
 * the dock snapshot already persists open/focused records, but the icon
 * metadata lived in useState only — after reload the bar dropped the
 * icon and the viewport fell back to Home. Components stay out of
 * storage; the icon resolves from its key on rehydrate.
 */
function loadExtraTools(): DockToolItem[] {
  const raw = platformStorage.getItem<PersistedExtraTool[]>(EXTRA_TOOLS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t.id === "string" && t.id)
    .map((t) => ({
      id: t.id,
      label: typeof t.label === "string" && t.label ? t.label : t.id,
      type: "icon" as const,
      icon: resolveIcon(t.iconKey || "Cards"),
      iconKey: t.iconKey,
    }));
}

export default function App() {
  const [activeToolId, setActiveToolId] = useState<string>("");
  const [pluginsInitialTab] = useState<"installed" | "discover">("installed");
  const [extraTools, setExtraTools] = useState<DockToolItem[]>(loadExtraTools);
  useEffect(() => {
    platformStorage.setItem<PersistedExtraTool[]>(
      EXTRA_TOOLS_KEY,
      extraTools.map((t) => ({ id: t.id, label: t.label, iconKey: t.iconKey }))
    );
  }, [extraTools]);

  const { setActiveTool: setDockActiveTool } = useDockStore();
  const hostTabs = useTabHostStore((s) => s.tabs);
  const hostTasks = useTabHostStore((s) => s.tasks);
  const besideIds = useDockStore((s) => s.besideIds);
  const besideWidth = useDockStore((s) => s.besideWidth);
  // Reload restores the panel exactly: persisted selection and collapsed
  // state survive a boot (ids/width live in the store itself).
  const persistedBesideUi = useMemo(loadBeside, []);
  const [besideCollapsed, setBesideCollapsed] = useState(persistedBesideUi.collapsed);
  const [besideSelected, setBesideSelected] = useState<string | null>(() =>
    persistedBesideUi.selected && persistedBesideUi.ids.includes(persistedBesideUi.selected)
      ? persistedBesideUi.selected
      : null
  );
  useEffect(() => {
    useDockStore.getState().persistBesideUi({ collapsed: besideCollapsed, selected: besideSelected });
  }, [besideCollapsed, besideSelected]);

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
    // Fresh profiles boot the open set from the server dock record (#174):
    // verbs keep writing dock_items, and an empty local cache adopts it.
    void useDockStore.getState().hydrateDockFromServer();
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

  // Beside eligibility: built-in tool panels plus installed/session plugins.
  // The browser stays main-only: one remote Chromium session per key.
  const besideDynamicIds = useMemo(
    () => new Set([...workspaceDockTools, ...activeExtraTools].map((t) => t.id)),
    [workspaceDockTools, activeExtraTools]
  );
  const besideTitleMap = useMemo(() => {
    const map = new Map<string, { title: string; iconKey?: string }>([
      ["browser", { title: "Browser", iconKey: "browser" }],
      ["plugins", { title: "Tools", iconKey: "toolbox" }],
      ["creations", { title: "Creations", iconKey: "creations" }],
      ["store", { title: "Library", iconKey: "library" }],
      ["settings", { title: "Settings", iconKey: "settings" }],
      ["theme", { title: "Settings", iconKey: "settings" }],
    ]);
    for (const item of DOCK_CORE_CATALOG) {
      if (!map.has(item.id)) map.set(item.id, { title: item.label, iconKey: item.icon });
    }
    for (const t of workspaceDockTools) {
      map.set(t.id, { title: t.label, iconKey: t.iconKey });
    }
    for (const t of activeExtraTools) {
      map.set(t.id, { title: t.label, iconKey: t.iconKey });
    }
    return map;
  }, [workspaceDockTools, activeExtraTools]);

  // Strip tabs: open beside tools, never the focused one (single home).
  const dockSnapshotBeside = useDockStore((s) => s.dock);
  const besideTabs: BesideTab[] = useMemo(
    () =>
      dockSnapshotBeside.order
        .filter((id) => {
          const record = dockSnapshotBeside.items[id];
          return (
            record !== undefined &&
            record.state !== "closed" &&
            besideIds.includes(id) &&
            id !== dockSnapshotBeside.focusedId
          );
        })
        .map((id) => ({
          id,
          title: besideTitleMap.get(id)?.title ?? id,
          iconKey: besideTitleMap.get(id)?.iconKey,
        })),
    [dockSnapshotBeside, besideIds, besideTitleMap]
  );
  const besideSelectedId =
    besideSelected && besideTabs.some((t) => t.id === besideSelected)
      ? besideSelected
      : besideTabs[0]?.id ?? null;
  const runningTabIds = useMemo(
    () =>
      Object.values(hostTasks)
        .filter((task) => task.status === "running")
        .map((task) => task.tabId),
    [hostTasks]
  );

  // Sandbox tabs per host: one home per tool, never mounted twice.
  const sandboxTabEntry = (t: DockToolItem) => ({
    id: t.id,
    render: () => (
      <DynamicPluginSandbox
        pluginId={t.id}
        title={t.label}
        onDismiss={() => handleDismissTool(t.id)}
        onAskAgentFix={(errorMsg) => {
          handleToolPromptSubmit(`Fix tool "${t.id}": ${errorMsg}`, { origin: "dock-fix" });
        }}
      />
    ),
  });
  const mainSandboxTabs = useMemo(
    () =>
      activeExtraTools
        .filter((t) => hostTabs[t.id]?.status === "live" && !besideIds.includes(t.id))
        .map(sandboxTabEntry),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeExtraTools, hostTabs, besideIds]
  );
  const besideSandboxTabs = useMemo(
    () =>
      activeExtraTools
        .filter((t) => hostTabs[t.id]?.status === "live" && besideIds.includes(t.id))
        .map(sandboxTabEntry),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeExtraTools, hostTabs, besideIds]
  );
  // Dynamic beside ids that still need a tab-host entry (boot restore).
  const besideDynamicMountIds = useMemo(
    () => besideTabs.map((t) => t.id).filter((id) => activeExtraTools.some((t) => t.id === id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [besideTabs, activeExtraTools]
  );

  // Open beside: mounts (or keeps) the tool in the beside panel without
  // touching main focus. Never steals focus.
  const handleOpenBeside = (toolId: string) => {
    if (!isBesideEligible(toolId, besideDynamicIds)) return;
    useDockStore.getState().openBeside(toolId);
    setBesideSelected(toolId);
    setBesideCollapsed(false);
  };

  // Dock select moves a beside tool back to the main view (single home).
  const moveBesideToMain = (toolId: string) => {
    if (besideIds.includes(toolId)) {
      useDockStore.getState().closeBeside(toolId);
    }
  };

  // Focus helpers: openBeside never moves focus; closing/collapsing the
  // panel returns focus to the main tool only when focus started inside it.
  const focusMainTool = () => {
    const focused = useDockStore.getState().dock.focusedId;
    const dockBtn = focused
      ? document.querySelector<HTMLElement>(`[data-dock-tool-id="${focused}"]`)
      : null;
    (dockBtn ?? document.querySelector<HTMLElement>("[data-home-orb]"))?.focus();
  };
  const focusInsideBeside = () =>
    typeof document !== "undefined" &&
    !!document.activeElement?.closest?.('[data-beside-panel="true"]');
  const collapseBesidePanel = (focusBack = true) => {
    setBesideCollapsed(true);
    if (focusBack && focusInsideBeside()) focusMainTool();
  };
  const clearBesidePanel = () => {
    const ids = useDockStore.getState().besideIds;
    const dock = useDockStore.getState();
    ids.forEach((id) => dock.closeTool(id));
    setBesideSelected(null);
    if (focusInsideBeside()) focusMainTool();
  };
  const handleBesideRemoveTab = (id: string) => {
    const wasInside = focusInsideBeside();
    useDockStore.getState().closeTool(id);
    setActiveToolId(useDockStore.getState().dock.focusedId ?? "");
    if (besideSelected === id) setBesideSelected(null);
    if (wasInside) {
      requestAnimationFrame(() => {
        const st = useDockStore.getState();
        const next = st.besideIds.find((x) => {
          const record = st.dock.items[x];
          return record && record.state !== "closed" && x !== st.dock.focusedId;
        });
        const target = next
          ? document.querySelector<HTMLElement>(`[data-tab-id="${next}"]`)
          : document.querySelector<HTMLElement>("[data-home-orb]");
        target?.focus();
      });
    }
  };

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

  const handleSelectTool = (toolId: string, opts?: { beside?: boolean }) => {
    if (!toolId) {
      setActiveToolId("");
      setDockActiveTool("");
      return;
    }
    if (opts?.beside) {
      if (isBesideEligible(toolId, besideDynamicIds)) {
        handleOpenBeside(toolId);
        return;
      }
      // Ineligible tools (agent, map, main-only surfaces) open normally.
    }
    // Focusing from the dock moves a beside tool back to the main view.
    moveBesideToMain(toolId);
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

    if (toolId === "settings" || toolId === "theme") {
      const nextTool = activeToolId === "settings" || activeToolId === "theme" ? "" : "settings";
      setActiveToolId(nextTool);
      setDockActiveTool(nextTool);
      return;
    }

    const wide = typeof window !== "undefined" && chatPlacement(window.innerWidth) === "side";

    if (layoutState === "full") {
      if (wide) {
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
    sendMessage(
      prompt,
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
    // Beside tools mount the same way: after a reload the persisted beside
    // set returns, and its dynamic tabs must remount or the panel is empty.
    for (const id of besideDynamicMountIds) {
      if (hostTabs[id]?.status !== "live") {
        useTabHostStore.getState().openTab(id, "plugin");
      }
    }
  }, [activeToolId, activeExtraTools, hostTabs, besideDynamicMountIds]);

  // Keep the local focus mirror in sync when the dock changes underneath
  // (keyboard, REST, CLI, agent verbs share the same registry).
  const dockFocusedId = useDockStore((s) => s.dock.focusedId);
  useEffect(() => {
    if ((dockFocusedId ?? "") !== activeToolId) {
      setActiveToolId(dockFocusedId ?? "");
    }
    // Focusing from the bar, palette, shortcut, or verbs moves a beside
    // tool back to the main view (single home per tool).
    if (dockFocusedId && besideIds.includes(dockFocusedId)) {
      useDockStore.getState().closeBeside(dockFocusedId);
    }
  }, [dockFocusedId, besideIds, activeToolId]);

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
        // Never steal keys while typing: chat inputs own their keys.
        // Escape below is unaffected.
        if (isTypingTarget(e.target)) return;
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
            const wide = typeof window !== "undefined" && chatPlacement(window.innerWidth) === "side";
            setLayoutState(wide ? "side" : "sheet");
          }
          return;
        }
        if (matched.action.id === "sidebar.beside") {
          // Same store path as the agent/CLI verb. Opening never steals
          // focus; there is nothing to focus back to.
          e.preventDefault();
          const focused = useDockStore.getState().dock.focusedId;
          if (focused && isBesideEligible(focused, besideDynamicIds)) {
            handleOpenBeside(focused);
          } else {
            dock.runDockAction("sidebar.beside");
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
        } else {
          // Chat is closed here. Media owns Esc while fullscreen or focused
          // inside a player: exiting fullscreen must not collapse the panel
          // or steal focus from the video.
          if (shouldYieldEscToMedia(e.target, document.fullscreenElement)) return;
          // First Esc collapses the beside panel, second Esc clears it.
          // Focus returns to the main tool only when it started inside the
          // panel; a main-view video never loses focus.
          const st = useDockStore.getState();
          const hasBeside = st.besideIds.some((id) => {
            const record = st.dock.items[id];
            return record && record.state !== "closed" && id !== st.dock.focusedId;
          });
          if (hasBeside && !besideCollapsed) {
            collapseBesidePanel();
          } else if (hasBeside) {
            st.clearBeside();
            setBesideSelected(null);
            if (focusInsideBeside()) focusMainTool();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layoutState, activeToolId, besideCollapsed, besideDynamicIds, setLayoutState]);

  // Viewport width drives the shared three-region placement rule.
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Tool hosted by the main viewport (single home per tool; beside tools
  // live in the beside panel). Shared with PluginsView's row-open contract
  // (MAIN_VIEW_STATIC_IDS) so the dock can never focus what the viewport
  // will not render (#373, #380).
  const MAIN_STATIC_IDS = useMemo(() => MAIN_VIEW_STATIC_IDS, []);
  const mainToolId =
    activeToolId !== "" &&
    !besideIds.includes(activeToolId) &&
    (MAIN_STATIC_IDS.has(activeToolId) ||
      activeToolId === "browser" ||
      activeExtraTools.some((t) => t.id === activeToolId))
      ? activeToolId
      : null;

  // One placement rule for content, beside, and chat panels.
  const layout = useMemo(
    () =>
      panelLayout({
        chatSideOpen: layoutState === "side",
        besideCount: besideTabs.length,
        viewportWidth,
        sideWidth,
        besideWidth,
      }),
    [layoutState, besideTabs.length, viewportWidth, sideWidth, besideWidth]
  );

  // Beside docked wide reserves the right region: chat must dock left
  // (side), never overlay it. Sheet is the implicit overlay state, so it
  // upgrades; an explicit full-screen maximize stays untouched.
  useEffect(() => {
    if (layout.besideSide && layoutState === "sheet") {
      setLayoutState("side");
    }
  }, [layout.besideSide, layoutState, setLayoutState]);

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
            activeToolId={activeToolId}
            isAgentSheetOpen={layoutState !== "closed"}
            isAgentWorking={isStreaming}
            extraTools={activeExtraTools}
            sessionTools={extraTools}
            onSelectTool={handleSelectTool}
            onOpenBesideItem={(id) => handleOpenBeside(id)}
            besideOffsetPx={layout.mainMarginRight}
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
              const wide = typeof window !== "undefined" && chatPlacement(window.innerWidth) === "side";
              setLayoutState(wide ? "side" : "sheet");
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
              retryLast({
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

          {/* Single Agent Conversation Instance */}
          <AgentConversation
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
              if (isBesideEligible(expId, besideDynamicIds)) setBesideSelected(expId);
            }}
              onCloseExperience={(expId) => {
                const dock = useDockStore.getState();
                dock.closeTool(expId);
                setActiveToolId(dock.dock.focusedId ?? "");
              }}
          />

          {/* Beside Panel: on-demand second tool, keep-alive while hidden */}
          <BesidePanel
            expanded={!besideCollapsed}
            hasTools={besideTabs.length > 0}
            overlay={layout.besideOverlay}
            width={besideWidth}
            offsetLeft={layout.mainMarginLeft}
            onWidthChange={(w) => useDockStore.getState().setBesideWidth(w)}
            tabs={besideTabs}
            selectedId={besideSelectedId}
            runningIds={runningTabIds}
            onSelectTab={(id) => setBesideSelected(id)}
            onRemoveTab={(id) => handleBesideRemoveTab(id)}
            onCollapse={() => collapseBesidePanel()}
            onClear={() => clearBesidePanel()}
          >
            <ToolSurface
              toolId={besideSelectedId}
              sandboxTabs={besideSandboxTabs}
              sandboxActiveId={besideSelectedId}
              onDismiss={(id) => handleBesideRemoveTab(id)}
              onOpenPlugin={(pluginId) => {
                moveBesideToMain(pluginId);
                setActiveToolId(pluginId);
                setDockActiveTool(pluginId);
                // Overlay sheet concludes: the tool moved to the main view,
                // so the sheet gets out of the way.
                if (layout.besideOverlay) setBesideCollapsed(true);
              }}
              onSelectTool={(id) => {
                handleSelectTool(id);
                // Overlay sheet concludes: selecting from the sheet opens in
                // the main view, so the sheet gets out of the way.
                if (layout.besideOverlay) setBesideCollapsed(true);
              }}
              pluginsInitialTab={pluginsInitialTab}
            />
          </BesidePanel>

          {/* Main Workspace Viewport */}
          <main
            style={
              layout.mainMarginLeft > 0 || layout.mainMarginRight > 0
                ? {
                    marginLeft: `${layout.mainMarginLeft}px`,
                    marginRight: `${layout.mainMarginRight}px`,
                    width: `calc(100% - ${layout.mainMarginLeft + layout.mainMarginRight}px)`,
                  }
                : undefined
            }
            className={cn(
              "relative z-10 w-full flex-1 flex flex-col items-center transition-[margin] duration-150 max-w-full"
            )}
          >
            {mainToolId ? (
              <ToolSurface
                toolId={mainToolId}
                sandboxTabs={mainSandboxTabs}
                sandboxActiveId={besideIds.includes(activeToolId) ? null : activeToolId}
                keepBuiltinsAlive
                onDismiss={(id) => handleDismissTool(id)}
                onOpenPlugin={(pluginId) => {
                  setActiveToolId(pluginId);
                  setDockActiveTool(pluginId);
                }}
                onSelectTool={(id) => handleSelectTool(id)}
                pluginsInitialTab={pluginsInitialTab}
              />
            ) : (
              <DockSurface frameless>
                <HomeScreen
                  onOpenAgent={() => {
                    const wide = typeof window !== "undefined" && chatPlacement(window.innerWidth) === "side";
                    setActiveToolId("agent");
                    setDockActiveTool("agent");
                    setLayoutState(wide ? "side" : "sheet");
                    // The home orb is the voice button: open and start listening.
                    requestVoiceStart();
                  }}
                  panelOpen={layoutState !== "closed"}
                />
              </DockSurface>
            )}
          </main>

          {/* Onboarding tour engine (auto-advance, dock choreography, takeover
              pause). Renders its own pill; the cinematic stage lives in the
              onboarding dock tab. */}
          <LiveOnboarding />
        </div>
      </RootLayout>
    </AppProviders>
  );
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof (el as HTMLElement).tagName !== "string") return false;
  const tag = (el as HTMLElement).tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable === true;
}
