import { z } from "zod";
import type { AgentTool } from "./types";
import { getCityContext } from "../../workspace/cityWorkspace";

const BUILTIN_TABS = [
  { id: "browser", title: "Browser", icon: "Globe", kind: "builtin" },
  { id: "notes", title: "Notes", icon: "FileText", kind: "builtin" },
  { id: "papers", title: "Papers", icon: "Scroll", kind: "builtin" },
  { id: "files", title: "Files", icon: "Folder", kind: "builtin" },
  { id: "terminal", title: "Terminal", icon: "Terminal", kind: "builtin" },
];

export const list_tabs: AgentTool<{ cityId?: string }> = {
  name: "list_tabs",
  description: "Lists tabs registered in the active dock. Use only when the user explicitly asks what exists; never for greetings, answers, or routine bookkeeping.",
  schema: z.object({
    cityId: z.string().optional().describe("Optional city slug to list tabs for"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId;
    let dynamicTabs: string[] = [];

    if (targetCity) {
      try {
        const context = await getCityContext(targetCity);
        dynamicTabs = context.tabs;
      } catch {
        dynamicTabs = [];
      }
    }

    let pinned: string[] = [];
    try {
      const { listDockPins } = await import("../../workspace/workspaces");
      pinned = listDockPins(ctx.workspaceId || targetCity || "default");
    } catch {
      pinned = [];
    }
    const isPinned = (id: string) => pinned.includes(id);

    return {
      builtin: BUILTIN_TABS.map((t) => ({ ...t, pinned: isPinned(t.id) })),
      dynamic: dynamicTabs.map((id) => ({
        id,
        kind: "dynamic",
        cityId: targetCity,
        pinned: isPinned(id),
      })),
    };
  },
};
