import { z } from "zod";
import type { AgentTool } from "./types";
import { resolveDockTarget } from "./dockCatalog";

export const dock_unpin: AgentTool<{ id: string; workspaceId?: string }> = {
  name: "dock_unpin",
  description:
    "Unpins a dock item from the Agentic Dock bar. The item stays installed and searchable; unpinning never deletes anything. Only call when the user explicitly asks to unpin or remove something from the bar.",
  schema: z.object({
    id: z.string().min(1).describe("Dock item id to unpin"),
    workspaceId: z.string().optional().describe("Workspace scope"),
  }),
  execute: async (args, ctx) => {
    const targetWorkspace = args.workspaceId || ctx.workspaceId || "default";
    const resolution = await resolveDockTarget(args.id, {
      workspaceId: targetWorkspace,
      workspaceId: ctx.workspaceId || targetWorkspace,
    });
    if (!resolution.entry) {
      return { success: false, id: args.id, action: "dock.unpin", message: resolution.error };
    }
    try {
      const { unpinDockItem } = await import("../../workspace/workspaces");
      unpinDockItem(ctx.workspaceId || targetWorkspace, resolution.entry.id);
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
