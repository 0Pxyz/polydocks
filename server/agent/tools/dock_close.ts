import { z } from "zod";
import type { AgentTool } from "./types";
import { resolveDockTarget } from "./dockCatalog";

export const dock_close: AgentTool<{ id: string; cityId?: string }> = {
  name: "dock_close",
  description:
    "Closes a dock tab (e.g. 'close the flashcards tab'). Closing only dismisses the open view; it never deletes data, plugins, or tabs. Deletion stays a separate explicitly approved flow. The map cannot be closed.",
  schema: z.object({
    id: z.string().min(1).describe("Dock item id to close"),
    cityId: z.string().optional().describe("City workspace scope (defaults to active city)"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId || "default";
    const resolution = await resolveDockTarget(args.id, {
      cityId: targetCity,
      workspaceId: ctx.workspaceId || targetCity,
    });
    if (!resolution.entry) {
      return { success: false, id: args.id, action: "dock.close", message: resolution.error };
    }
    if (resolution.entry.id === "maps") {
      return {
        success: false,
        id: resolution.entry.id,
        action: "dock.close",
        message: "The map is always in the dock and cannot be closed.",
      };
    }
    if (resolution.entry.kind === "store") {
      return {
        success: false,
        id: resolution.entry.id,
        action: "dock.close",
        message: `"${resolution.entry.title}" is not installed, so there is nothing to close.`,
      };
    }
    return {
      success: true,
      id: resolution.entry.id,
      action: "dock.close",
      message: `Closed "${resolution.entry.title}". Nothing was deleted.`,
    };
  },
};
