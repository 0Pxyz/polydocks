import type { PluginManifest, Surface } from "../../../server/plugins/manifest";
import type { DockToolItem } from "./AgenticDock";

export interface LegacyTabConfig {
  id: string;
  label: string;
  icon?: any;
  variant?: "immersive" | "floating" | "sheet";
}

/**
 * Wraps a legacy dock tab or tool into a standard PluginManifest contract.
 */
export function legacyTabToPlugin(tab: LegacyTabConfig | DockToolItem): PluginManifest {
  const iconName =
    typeof tab.icon === "string"
      ? tab.icon
      : (tab.icon as any)?.displayName || (tab.icon as any)?.name || "Sparkle";

  const surfaceVariant = (tab as any).variant || "immersive";

  const surface: Surface = {
    id: tab.id,
    title: tab.label,
    icon: iconName,
    variant: surfaceVariant,
    entry: tab.id,
  };

  return {
    apiVersion: 1,
    id: tab.id,
    name: tab.label,
    version: "1.0.0",
    description: `Legacy workspace surface: ${tab.label}`,
    icon: iconName,
    trust: "first-party",
    capabilities: [],
    surfaces: [surface],
    permissions: [],
  };
}
