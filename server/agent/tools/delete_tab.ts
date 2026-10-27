import { z } from "zod";
import type { AgentTool } from "./types";
import { deleteCityFile } from "../../workspace/cityWorkspace";

export const delete_tab: AgentTool<{
  id: string;
  userApproved: boolean;
  cityId?: string;
}> = {
  name: "delete_tab",
  description:
    "Deletes a dynamic dock tool tab from the city workspace. Requires explicit user approval flag.",
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

    await deleteCityFile(targetCity, `tabs/${args.id}/index.html`).catch(() => {});
    await deleteCityFile(targetCity, `tabs/${args.id}/manifest.json`).catch(() => {});

    return {
      success: true,
      tabId: args.id,
      cityId: targetCity,
      action: "tab.deleted",
    };
  },
};
