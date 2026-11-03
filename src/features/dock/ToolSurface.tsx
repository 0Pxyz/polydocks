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
  if (toolId === "settings" || toolId === "theme") {
    return (
      <DockSurface frameless>
        <SettingsView />
      </DockSurface>
    );
  }
  if (toolId === "plugins" || toolId === "creations") {
    return (
      <DockSurface frameless>
        <PluginsView
          key={toolId === "creations" ? "created" : pluginsInitialTab}
          initialTab={pluginsInitialTab}
          onOpenPlugin={(id) => onSelectTool(id)}
          onDismiss={() => onDismiss(toolId)}
        />
      </DockSurface>
    );
  }
  if (toolId === "store") {
    return (
      <DockSurface frameless>
        <PluginStoreView
          onDismiss={() => onDismiss("store")}
          onOpenPlugin={(pluginId) => onOpenPlugin(pluginId)}
        />
      </DockSurface>
    );
  }
  if (toolId && sandboxTabs.some((t) => t.id === toolId)) {
    return (
      <DockSurface variant="immersive">
        <TabHost
          activeId={sandboxActiveId ?? toolId}
          tabs={sandboxTabs.map((t) => ({ id: t.id, render: t.render }))}
        />
      </DockSurface>
    );
  }
  if (toolId === "browser") {
    return (
      <DockSurface frameless className="pb-0">
        <div className="w-full flex-1 min-w-0 flex flex-col min-h-0">
          <NativeBrowserView workspaceKey="home" />
        </div>
      </DockSurface>
    );
  }
  if (toolId === "notes") {
    return (
      <DockSurface frameless className="pb-0">
        <div className="w-full flex-1 min-w-0 flex flex-col min-h-0">
          <NotesView workspaceKey="home" />
        </div>
      </DockSurface>
    );
  }
  if (toolId === "onboarding") {
    return (
      <DockSurface frameless>
        <OnboardingPluginView onDismiss={() => onDismiss("onboarding")} />
      </DockSurface>
    );
  }
  if (toolId === "inspect") {
    // Dev-only runtime inspector (#181): outside DEV builds the surface
    // explains itself instead of mounting blank (#319).
    if (!import.meta.env.DEV) {
      return (
        <DockSurface frameless>
          <div className="w-full max-w-2xl px-4 py-8" aria-label="Inspect unavailable">
            <p className="text-sm font-medium text-white/90">Inspect is a dev-only surface.</p>
            <p className="mt-1 text-xs text-white/50">
              Run a dev build to watch the live agent runtime here.
            </p>
          </div>
        </DockSurface>
      );
    }
    return (
      <DockSurface frameless>
        <InspectView />
      </DockSurface>
    );
  }
  return (
    <DockSurface frameless>
      <div className="w-full max-w-2xl px-4 py-8" aria-label={`No view for ${toolId ?? "none"}`}>
        <p className="text-sm font-medium text-white/90">No view component registered for &ldquo;{toolId}&rdquo;.</p>
        <p className="mt-1 text-xs text-white/50">Pick another tool from the dock.</p>
      </div>
    </DockSurface>
  );
}
