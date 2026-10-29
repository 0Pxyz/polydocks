import { z } from "zod";
import type { AgentTool } from "./types";
import { resolveDockTarget } from "./dockCatalog";

export const dock_unpin: AgentTool<{ id: string; cityId?: string }> = {
  name: "dock_unpin",
  description:
    "Unpins a dock item from the Agentic Dock bar. The item stays installed and searchable; unpinning never deletes anything. Only call when the user explicitly asks to unpin or remove something from the bar. The map cannot be unpinned.",
  schema: z.object({
    id: z.string().min(1).describe("Dock item id to unpin"),
    cityId: z.string().optional().describe("City workspace scope (defaults to active city)"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId || "default";
    const resolution = await resolveDockTarget(args.id, {
      cityId: targetCity,
      workspaceId: ctx.workspaceId || targetCity,
    });
    if (!resolution.entry) {
      return { success: false, id: args.id, action: "dock.unpin", message: resolution.error };
    }
    if (resolution.entry.id === "maps") {
      return {
        success: false,
        id: resolution.entry.id,
        action: "dock.unpin",
        message: "The map is always in the dock and cannot be removed.",
      };
    }
    try {
      const { unpinDockItem } = await import("../../workspace/workspaces");
      unpinDockItem(ctx.workspaceId || targetCity, resolution.entry.id);
    } catch {
      // Non-fatal: the client-side unpin still applies.
    }
    return {
      success: true,
      id: resolution.entry.id,
      action: "dock.unpin",
      message: `Unpinned "${resolution.entry.title}". It stays installed and searchable.`,
    };
  },
};
