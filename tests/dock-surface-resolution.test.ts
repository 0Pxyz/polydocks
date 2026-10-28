import { describe, it, expect } from "bun:test";
import { legacyTabToPlugin } from "../src/features/dock/legacyAdapter";
import {
  resolveDockSurfaces,
  surfaceToDockTool,
  resolveSurfaceIcon,
  ICON_CATALOG,
} from "../src/features/dock/surfaceResolver";
import { validatePluginManifest, type PluginManifest } from "../server/plugins/manifest";
import { TerminalWindow, Folder } from "@phosphor-icons/react";

describe("Dock Surface Resolution & Legacy Tab Adapter", () => {
  describe("legacyTabToPlugin Adapter", () => {
    it("wraps a legacy tab config into a compliant PluginManifest (apiVersion: 1)", () => {
      const legacyTab = {
        id: "terminal",
        label: "City Terminal",
        icon: TerminalWindow,
      };

      const manifest = legacyTabToPlugin(legacyTab);

      expect(manifest.apiVersion).toBe(1);
      expect(manifest.id).toBe("terminal");
      expect(manifest.name).toBe("City Terminal");
      expect(manifest.trust).toBe("first-party");
      expect(manifest.surfaces?.length).toBe(1);
      expect(manifest.surfaces?.[0].id).toBe("terminal");
      expect(manifest.surfaces?.[0].variant).toBe("immersive");

      const validation = validatePluginManifest(manifest);
      expect(validation.success).toBe(true);
    });
  });

  describe("Surface and Icon Resolvers", () => {
    it("resolves catalog icons by name with fallback to Sparkle", () => {
      expect(resolveSurfaceIcon("Compass")).toBe(ICON_CATALOG.Compass);
      expect(resolveSurfaceIcon("Globe")).toBe(ICON_CATALOG.Globe);
      expect(resolveSurfaceIcon("unknown-icon")).toBe(ICON_CATALOG.Sparkle);
    });

    it("converts a surface manifest into an active DockToolItem", () => {
      const surface = {
        id: "notes",
        title: "Notes & Synthesis",
        icon: "NotePencil",
        variant: "immersive" as const,
        entry: "NotesView",
      };

      const dockTool = surfaceToDockTool(surface);
      expect(dockTool.id).toBe("notes");
      expect(dockTool.label).toBe("Notes & Synthesis");
      expect(dockTool.icon).toBe(ICON_CATALOG.NotePencil);
      expect(dockTool.isAgent).toBe(false);
    });

    it("flags agent tools accurately", () => {
      const surface = {
        id: "agent",
        title: "Agent Co-Pilot",
        icon: "Sparkle",
        variant: "sheet" as const,
        entry: "AgentConversation",
      };

      const dockTool = surfaceToDockTool(surface);
      expect(dockTool.isAgent).toBe(true);
    });
  });

  describe("resolveDockSurfaces Integration", () => {
    it("resolves surfaces from plugin manifests and merges legacy tabs without duplicates", () => {
      const pluginManifests: PluginManifest[] = [
        {
          apiVersion: 1,
          id: "browser",
          name: "Browser & Sources",
          version: "1.0.0",
          description: "Web reader",
          icon: "Globe",
          trust: "first-party",
          capabilities: [],
          surfaces: [
            {
              id: "browser",
              title: "Research & Sources",
              icon: "Globe",
              variant: "immersive",
              entry: "SourcesView",
            },
          ],
          permissions: [],
        },
      ];

      const legacyTabs = [
        {
          id: "browser", // duplicate id, should not be duplicated
          label: "Legacy Browser",
          type: "icon" as const,
          icon: ICON_CATALOG.Globe,
        },
        {
          id: "files",
          label: "City Files",
          type: "icon" as const,
          icon: Folder,
        },
      ];

      const resolved = resolveDockSurfaces(pluginManifests, legacyTabs);

      expect(resolved.length).toBe(2);
      expect(resolved[0].id).toBe("browser");
      expect(resolved[0].label).toBe("Research & Sources");
      expect(resolved[1].id).toBe("files");
      expect(resolved[1].label).toBe("City Files");
    });
  });
});
