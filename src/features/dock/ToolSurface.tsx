import { DockSurface } from "@/features/dock/DockSurface";
import { TabHost } from "@/features/dock/TabHost";
import { useMemo } from "react";
import { MAIN_VIEW_STATIC_IDS } from "@/lib/dock/dockModel";
import { useDockStore } from "@/lib/store/useDockStore";
import { SettingsView } from "@/features/settings/SettingsView";
import { PluginsView } from "@/features/plugins/PluginsView";
import { PluginStoreView } from "@/features/plugins/PluginStoreView";
import { NativeBrowserView } from "@/features/browser/NativeBrowserView";
import { NotesView } from "@/features/notes/NotesView";
import { OnboardingPluginView } from "@/features/onboarding/OnboardingPluginView";
import { InspectView } from "@/features/inspect/InspectView";
import { SurfaceErrorBoundary } from "@/components/ui/surface-error-boundary";

export interface SurfaceSandboxTab {
  id: string;
  render: () => React.ReactNode;
}

interface ToolSurfaceProps {
  /** Focused tool id for this host (null renders nothing). */
  toolId: string | null;
  /** Live sandbox tabs mounted by this host (kept alive hidden). */
  sandboxTabs: SurfaceSandboxTab[];
  /** Active sandbox id within this host. */
  sandboxActiveId: string | null;
  /** Close/dismiss action for this host (main destroys, beside hibernates). */
  onDismiss: (id: string) => void;
  onOpenPlugin: (pluginId: string) => void;
  onSelectTool: (id: string) => void;
  pluginsInitialTab: "installed" | "discover";
  /**
   * Main host keeps open builtin views mounted (hidden) across navigation.
   * The beside host never owns builtins, so it renders only its own tabs.
   */
  keepBuiltinsAlive?: boolean;
}

/**
 * One definition for every tool surface, rendered by both hosts (main
 * viewport and beside panel). A tool id mounts in exactly one host:
 * switching hosts remounts, switching tabs inside a host never does.
 *
 * Never renders blank: unknown ids and dev-only surfaces outside DEV get
 * an explicit message, and every surface sits behind a visual error
 * boundary (#319).
 */
export function ToolSurface({
  toolId,
  sandboxTabs,
  sandboxActiveId,
  onDismiss,
  onOpenPlugin,
  onSelectTool,
  pluginsInitialTab,
  keepBuiltinsAlive = false,
}: ToolSurfaceProps) {
  return (
    <SurfaceErrorBoundary toolId={toolId ?? "none"}>
      <ToolSurfaceInner
        toolId={toolId}
        sandboxTabs={sandboxTabs}
        sandboxActiveId={sandboxActiveId}
        onDismiss={onDismiss}
        onOpenPlugin={onOpenPlugin}
        onSelectTool={onSelectTool}
        pluginsInitialTab={pluginsInitialTab}
        keepBuiltinsAlive={keepBuiltinsAlive}
      />
    </SurfaceErrorBoundary>
  );
}

function ToolSurfaceInner({
  toolId,
  sandboxTabs,
  sandboxActiveId,
  onDismiss,
  onOpenPlugin,
  onSelectTool,
  pluginsInitialTab,
  keepBuiltinsAlive = false,
}: ToolSurfaceProps) {
  // Keep-alive host (platform rule: open tabs never reload on navigation).
  // Every live sandbox tab stays mounted across ALL surfaces — the TabHost
  // hides inactive tabs instead of unmounting them, so running plugin state
  // (timers, drafts, counters) survives navigating to a builtin view and
  // back. Only the focused surface is visible; the rest hide, never unmount.
  const focusedSandbox = toolId != null && sandboxTabs.some((t) => t.id === toolId);
  // Same contract for first-party views (browser, notes, settings, …):
  // every id the dock has open stays mounted once opened, hidden unless
  // focused. New static surfaces join automatically through
  // MAIN_VIEW_STATIC_IDS (the same set App's viewport routing already
  // requires), so future views keep alive with no ToolSurface change.
  // Explicit close removes the id from openIds and unmounts, as before.
  const openIds = useDockStore((s) => s.openIds);
  const sandboxIds = useMemo(() => new Set(sandboxTabs.map((t) => t.id)), [sandboxTabs]);
  const keptBuiltinIds = useMemo(() => {
    if (!keepBuiltinsAlive) return [];
    return openIds.filter((id) => MAIN_VIEW_STATIC_IDS.has(id) && !sandboxIds.has(id));
  }, [keepBuiltinsAlive, openIds, sandboxIds]);
  const actions = { onDismiss, onOpenPlugin, onSelectTool, pluginsInitialTab };
  // Browser and notes go edge-to-edge (no bottom pad), as before.
  const edgeToEdge = toolId === "browser" || toolId === "notes";
  // The host owns the active id: when a builtin surface is focused, no
  // sandbox tab is active here (a stale sandboxActiveId from the caller
  // must never light up a hidden tab underneath the builtin view).
  const hostActiveId = focusedSandbox ? (sandboxActiveId ?? toolId ?? "") : "";
  return (
    <DockSurface
      variant={focusedSandbox ? "immersive" : undefined}
      frameless={!focusedSandbox}
      className={edgeToEdge && !focusedSandbox ? "pb-0" : undefined}
    >
      <TabHost
        activeId={hostActiveId}
        tabs={sandboxTabs.map((t) => ({ id: t.id, render: t.render }))}
      />
      {keptBuiltinIds.map((id) => (
        <div key={`kept-${id}`} hidden={id !== toolId} className={id !== toolId ? undefined : "contents"}>
          {renderBuiltinView(id, actions)}
        </div>
      ))}
      {!focusedSandbox && !keptBuiltinIds.includes(toolId ?? "") && (
        <>{renderBuiltinView(toolId, actions)}</>
      )}
    </DockSurface>
  );
}

function renderBuiltinView(
  toolId: string | null,
  actions: {
    onDismiss: (id: string) => void;
    onOpenPlugin: (pluginId: string) => void;
    onSelectTool: (id: string) => void;
    pluginsInitialTab: "installed" | "discover";
  }
) {
  if (toolId === null) return null;
  if (toolId === "settings" || toolId === "theme") {
    return <SettingsView />;
  }
  if (toolId === "plugins" || toolId === "creations") {
    return (
      <PluginsView
        key={toolId === "creations" ? "created" : actions.pluginsInitialTab}
        initialTab={actions.pluginsInitialTab}
        lockTrust={toolId === "creations" ? "generated" : undefined}
        onOpenPlugin={(id) => actions.onSelectTool(id)}
        onDismiss={() => actions.onDismiss(toolId)}
      />
    );
  }
  if (toolId === "store") {
    return (
      <PluginStoreView
        onDismiss={() => actions.onDismiss("store")}
        onOpenPlugin={(pluginId) => actions.onOpenPlugin(pluginId)}
      />
    );
  }
  if (toolId === "browser") {
    return (
      <div className="w-full flex-1 min-w-0 flex flex-col min-h-0">
        <NativeBrowserView workspaceKey="home" />
      </div>
    );
  }
  if (toolId === "notes") {
    return (
      <div className="w-full flex-1 min-w-0 flex flex-col min-h-0">
        <NotesView workspaceKey="home" />
      </div>
    );
  }
  if (toolId === "onboarding") {
    return <OnboardingPluginView onDismiss={() => actions.onDismiss("onboarding")} />;
  }
  if (toolId === "inspect") {
    // Dev-only runtime inspector (#181): outside DEV builds the surface
    // explains itself instead of mounting blank (#319).
    if (!import.meta.env.DEV) {
      return (
        <div className="w-full max-w-2xl px-4 py-8" aria-label="Inspect unavailable">
          <p className="text-sm font-medium text-white/90">Inspect is a dev-only surface.</p>
          <p className="mt-1 text-xs text-white/50">
            Run a dev build to watch the live agent runtime here.
          </p>
        </div>
      );
    }
    return <InspectView />;
  }
  return (
    <div className="w-full max-w-2xl px-4 py-8" aria-label={`No view for ${toolId ?? "none"}`}>
      <p className="text-sm font-medium text-white/90">No view component registered for &ldquo;{toolId}&rdquo;.</p>
      <p className="mt-1 text-xs text-white/50">Pick another tool from the dock.</p>
    </div>
  );
}
