import type { PluginManifest } from "../manifest";
import { pluginRegistry } from "../registry";

/**
 * Inspect developer plugin (#181): one screen showing live agent runtime
 * (requests, routing decisions, actions, jobs, results) from real events
 * only. Read-only by construction: no capabilities, no permissions.
 *
 * Dev-only gating lives client-side (ToolSurface renders it only in DEV);
 * the manifest carries no visibility field on purpose.
 */
export const inspectPluginManifest: PluginManifest = {
  apiVersion: 1,
  id: "inspect",
  name: "Inspect",
  version: "1.0.0",
  description: "Developer view of the live agent runtime: requests, routing, jobs, results. Real events only.",
  icon: "ChartLineUp",
  trust: "first-party",
  capabilities: [],
  surfaces: [
    {
      id: "inspect",
      title: "Inspect",
      icon: "ChartLineUp",
      variant: "immersive",
      entry: "InspectView",
    },
  ],
  permissions: [],
};

export function registerInspectPlugin(): void {
  try {
    pluginRegistry.install(inspectPluginManifest);
  } catch {
    // Registry may already hold it; inspect is best-effort dev tooling.
  }
}
