import { DockSurface } from "@/features/dock/DockSurface";
import { TabHost } from "@/features/dock/TabHost";
import { ThemeCustomizerView } from "@/features/theme/ThemeCustomizerView";
import { PluginsView } from "@/features/plugins/PluginsView";
import { PluginStoreView } from "@/features/plugins/PluginStoreView";
import { NativeBrowserView } from "@/features/browser/NativeBrowserView";
import { BitcoinViewer } from "@/features/dock/BitcoinViewer";
import { OnboardingPluginView } from "@/features/onboarding/OnboardingPluginView";

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
  if (toolId === "settings" || toolId === "theme") {
    return (
      <DockSurface frameless>
        <ThemeCustomizerView onDismiss={() => onDismiss("settings")} />
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
  if (toolId === "bitcoin-viewer" || toolId === "deep-work-flashcards") {
    return (
      <DockSurface frameless>
        <BitcoinViewer onDismiss={() => onDismiss(toolId)} />
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
  return null;
}
