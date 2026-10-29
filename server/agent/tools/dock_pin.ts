import { z } from "zod";
import type { AgentTool } from "./types";
import { resolveDockTarget } from "./dockCatalog";

export const dock_pin: AgentTool<{ id: string; cityId?: string }> = {
  name: "dock_pin",
  description:
    "Pins an existing dock item to the Agentic Dock bar so it stays one click away. Only call when the user explicitly asks to pin or keep something. The client applies the pin through the shared dock layer and reads the state back; the message in the result is the verified outcome. Never use for store-only plugins: tell the user to install them first.",
  schema: z.object({
    id: z.string().min(1).describe("Dock item id (e.g. 'browser', 'gtm-feed', 'flashcards')"),
    cityId: z.string().optional().describe("City workspace scope (defaults to active city)"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId || "default";
    const resolution = await resolveDockTarget(args.id, {
      cityId: targetCity,
      workspaceId: ctx.workspaceId || targetCity,
    });
    if (!resolution.entry) {
      return { success: false, id: args.id, action: "dock.pin", message: resolution.error };
    }
    if (resolution.entry.kind === "store") {
      return {
        success: false,
        id: args.id,
        action: "dock.pin",
        message: `"${resolution.entry.title}" lives in the store and is not installed. Install it first, then pin it.`,
      };
    }
    return {
      success: true,
      id: resolution.entry.id,
      action: "dock.pin",
      message: `Pinned "${resolution.entry.title}".`,
    };
  },
};
