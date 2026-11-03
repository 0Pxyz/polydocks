import { DockSurface } from "@/features/dock/DockSurface";
import { TabHost } from "@/features/dock/TabHost";
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
}: ToolSurfaceProps) {
  // Keep-alive host (platform rule: open tabs never reload on navigation).
  // Every live sandbox tab stays mounted across ALL surfaces — the TabHost
  // hides inactive tabs instead of unmounting them, so running plugin state
  // (timers, drafts, counters) survives navigating to a builtin view and
  // back. Only the focused surface is visible; the rest hide, never unmount.
  const focusedSandbox = toolId != null && sandboxTabs.some((t) => t.id === toolId);
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
      {renderBuiltinView(toolId, { onDismiss, onOpenPlugin, onSelectTool, pluginsInitialTab, isHidden: focusedSandbox })}
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
    /** A focused sandbox tab owns the viewport; builtins stay out of the way. */
    isHidden: boolean;
  }
) {
  if (toolId === null || actions.isHidden) return null;
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
