import type { PluginManifest, Surface } from "../../../server/plugins/manifest";
import type { DockToolItem } from "./AgenticDock";
import { legacyTabToPlugin } from "./legacyAdapter";
import {
  Sparkle,
  Compass,
  Globe,
  NotePencil,
  Cards,
  TerminalWindow,
  Folder,
  Sliders,
  Target,
  BookOpen,
  SquaresFour,
} from "@phosphor-icons/react";
import type { IconComponent } from "@/components/icons/adapter";

/**
 * Icon catalog map for resolving icon names to Phosphor React icon components.
 */
export const ICON_CATALOG: Record<string, IconComponent> = {
  Sparkle,
  Compass,
  Globe,
  NotePencil,
  Cards,
  TerminalWindow,
  Folder,
  Sliders,
  Target,
  BookOpen,
  SquaresFour,
};

/**
 * Resolve an icon component from string or component reference.
 */
export function resolveSurfaceIcon(icon: unknown): IconComponent {
  if (typeof icon === "string") {
    return ICON_CATALOG[icon] || Sparkle;
  }
  if (icon && typeof icon === "object") {
    return icon as IconComponent;
  }
  return Sparkle;
}

/**
 * Converts a plugin surface manifest into an active DockToolItem.
 */
export function surfaceToDockTool(surface: Surface, plugin?: PluginManifest): DockToolItem {
  const iconComponent = resolveSurfaceIcon(surface.icon);
  const isAgent = surface.id === "agent" || plugin?.id === "agent";

  return {
    id: surface.id,
    label: surface.title,
    type: "icon",
    icon: iconComponent,
    isAgent,
  };
}

/**
 * Resolves all active dock tools from a list of plugin manifests.
 * Automatically wraps legacy tools using legacyTabToPlugin if provided.
 */
export function resolveDockSurfaces(
  plugins: PluginManifest[],
  legacyTabs: DockToolItem[] = []
): DockToolItem[] {
  const dockTools: DockToolItem[] = [];
  const seenIds = new Set<string>();

  // 1. Process plugin surfaces
  for (const plugin of plugins) {
    for (const surface of plugin.surfaces || []) {
      if (!seenIds.has(surface.id)) {
        dockTools.push(surfaceToDockTool(surface, plugin));
        seenIds.add(surface.id);
      }
    }
  }

  // 2. Process legacy tabs using legacyTabToPlugin adapter
  for (const legacyTab of legacyTabs) {
    if (!seenIds.has(legacyTab.id)) {
      const adapted = legacyTabToPlugin(legacyTab);
      const surface = adapted.surfaces?.[0];
      if (surface) {
        dockTools.push({
          ...legacyTab,
          icon: legacyTab.icon || resolveSurfaceIcon(surface.icon),
        });
        seenIds.add(legacyTab.id);
      }
    }
  }

  return dockTools;
}
