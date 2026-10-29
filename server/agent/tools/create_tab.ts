import { z } from "zod";
import type { AgentTool } from "./types";
import { writeLegacyFeature, writeFeature } from "../../workspace/features";
import { isPluginIdTaken, normalizePluginId, verifyPluginStateAsync, ensurePluginRegisteredAndMounted } from "../../plugins/verify";

export interface CreateTabArgs {
  id: string;
  title: string;
  icon?: string;
  code?: string;
  html?: string;
  scope?: "city" | "global";
  cityId?: string;
  capabilities?: string[];
  permissions?: any[];
}

export const create_tab: AgentTool<CreateTabArgs> = {
  name: "create_tab",
  description:
    "Synthesizes and mounts a new dynamic tool tab into the Dock tray as a versioned TypeScript feature module or self-contained HTML/CSS/JS.",
  schema: z
    .object({
      id: z
        .string()
        .regex(
          /^[a-z0-9_-]+$/,
          "Tab id must contain only lowercase letters, numbers, hyphens or underscores"
        ),
      title: z.string().min(1).describe("Human-readable title shown on the dock icon / header"),
      icon: z.string().default("Layers").describe("Lucide icon name (e.g. Layers, Scale, Bookmark)"),
      code: z
        .string()
        .optional()
        .describe(
          "TypeScript feature module (.ts) without external imports, interacting via window.polymax bridge"
        ),
      html: z
        .string()
        .optional()
        .describe("Complete self-contained HTML/CSS/JS document rendered in the sandbox (legacy format)"),
      scope: z.enum(["city", "global"]).default("city"),
      cityId: z.string().optional().describe("City identifier to mount the tab inside"),
      capabilities: z
        .array(z.string())
        .optional()
        .describe("Declared bridge capability IDs this experience is permitted to invoke"),
      permissions: z.array(z.any()).optional().describe("Declared granular permissions"),
    })
    .refine((data) => Boolean(data.code || data.html), {
      message: "Either 'code' (TypeScript feature module) or 'html' (legacy document) must be provided.",
    }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId || (args.scope === "global" ? "global" : args.id);

    // Update-instead-of-recreate guard: normalized id checked across
    // registry + tab/plugin namespaces in every scope, not just this city.
    const normalized = normalizePluginId(args.id);
    const taken = isPluginIdTaken(normalized);
    if (taken.taken) {
      return {
        success: false,
        error: `Tab "${normalized}" already exists (${taken.namespaces.join(", ")}). Use update_tab to modify the existing experience instead of recreating it.`,
      };
    }

    const manifest = {
      id: normalized,
      title: args.title,
      icon: args.icon || "Layers",
      scope: args.scope || "city",
      capabilities: args.capabilities || [],
      permissions: args.permissions || [],
      createdAt: new Date().toISOString(),
    };

    if (args.code) {
      // Modern feature module path
      await writeFeature(targetCity, normalized, {
        manifest,
        code: args.code,
      });

      ensurePluginRegisteredAndMounted(normalized, targetCity, manifest);
      const verification = await verifyPluginStateAsync(normalized, targetCity);
      if (!verification.ok) {
        return {
          success: false,
          error: verification.error || "Tab verification failed after create",
          verification,
          tab: manifest,
          cityId: targetCity,
        };
      }
      return {
        success: true,
        tab: manifest,
        cityId: targetCity,
        action: "tab.created",
        format: "feature-ts",
        verification,
      };
    }

    // Legacy HTML blob path (SQLite single source of truth, no FS mirroring)
    const rawHtml = args.html || "";
    await writeLegacyFeature(targetCity, normalized, manifest, rawHtml);

    ensurePluginRegisteredAndMounted(normalized, targetCity, manifest);
    const verification = await verifyPluginStateAsync(normalized, targetCity);
    if (!verification.ok) {
      return {
        success: false,
        error: verification.error || "Tab verification failed after create",
        verification,
        tab: manifest,
        cityId: targetCity,
      };
    }
    return {
      success: true,
      tab: manifest,
      cityId: targetCity,
      action: "tab.created",
      format: "legacy-html",
      verification,
    };
  },
};
