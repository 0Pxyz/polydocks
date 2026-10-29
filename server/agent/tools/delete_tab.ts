import { z } from "zod";
import type { AgentTool } from "./types";
import { deleteFeature } from "../../workspace/features";

export const delete_tab: AgentTool<{
  id: string;
  userApproved: boolean;
  cityId?: string;
}> = {
  name: "delete_tab",
  description:
    "Removes a tab permanently and needs userApproved true. Use only for explicit deletion asks (closing uses close_tray); without approval it only pauses.",
  schema: z.object({
    id: z.string().describe("Identifier of the dynamic tab to delete"),
    userApproved: z
      .boolean()
      .describe("Mandatory confirmation flag indicating the user has explicitly approved deletion"),
    cityId: z.string().optional(),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId;
    if (!targetCity) {
      throw new Error("Cannot delete a tab without an active city workspace scope.");
    }

    if (!args.userApproved) {
      return {
        status: "approval_required",
        requiresConfirmation: true,
        message: `Deletion of tab "${args.id}" paused: user approval required.`,
      };
    }

    await deleteFeature(targetCity, args.id);

    return {
      success: true,
      tabId: args.id,
      cityId: targetCity,
      action: "tab.deleted",
    };
  },
};
