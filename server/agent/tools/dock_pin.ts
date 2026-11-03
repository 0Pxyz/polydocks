import { z } from "zod";
import type { AgentTool } from "./types";
import { resolveDockTarget } from "./dockCatalog";

export const dock_pin: AgentTool<{ id: string; workspaceId?: string }> = {
  name: "dock_pin",
  description:
    "Pins an existing dock item to the Agentic Dock bar so it stays one click away. Only call when the user explicitly asks to pin or keep something. The client applies the pin through the shared dock layer and reads the state back; the message in the result is the verified outcome. Never use for store-only plugins: tell the user to install them first.",
  schema: z.object({
    id: z.string().min(1).describe("Dock item id (e.g. 'browser', 'gtm-feed', 'flashcards')"),
    workspaceId: z.string().optional().describe("Workspace scope"),
  }),
  execute: async (args, ctx) => {
    const targetWorkspace = args.workspaceId || ctx.workspaceId || "default";
    const resolution = await resolveDockTarget(args.id, {
      workspaceId: targetWorkspace,
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
    // Durable pin record (server truth; the client keeps its own cache).
    // Builtins have no plugin row — the dock_pins table
    // covers every kind of item uniformly.
    try {
      const { pinDockItem } = await import("../../workspace/workspaces");
      pinDockItem(ctx.workspaceId || targetWorkspace, resolution.entry.id);
    } catch {
      // Non-fatal: the client-side pin still applies.
    }
    return {
      success: true,
      id: resolution.entry.id,
      action: "dock.pin",
      message: `Pinned "${resolution.entry.title}".`,
    };
  },
};
