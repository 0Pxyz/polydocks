import { z } from "zod";
import type { AgentTool } from "./types";
import { deleteFeature } from "../../workspace/features";

export const delete_tab: AgentTool<{
  id: string;
  userApproved?: boolean;
  cityId?: string;
}> = {
  name: "delete_tab",
  description:
    "Removes a tab permanently and needs userApproved true. Use only for explicit deletion asks (closing uses close_tray); without approval it only pauses.",
  schema: z.object({
    id: z.string().describe("Identifier of the dynamic tab to delete"),
    userApproved: z
      .boolean()
      .optional()
      .describe("Mandatory confirmation flag indicating the user has explicitly approved deletion"),
    cityId: z.string().optional(),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId;
    if (!targetCity) {
      throw new Error("Cannot delete a tab without an active city workspace scope.");
    }

    // Shared policy values decide never/auto; the ask-case keeps the legacy
    // approval_required envelope the banner depends on. Deletion is
    // destructive: in ask mode it always pauses without an explicit yes,
    // regardless of actor. Fail closed: denied policy never deletes.
    const { config } = await import("../../config");
    if (config.INSTALL_POLICY === "never") {
      return {
        ok: false,
        error: "Install policy is 'never': deletion is disabled.",
        retryable: false,
        code: "install_denied",
      };
    }
    if (config.INSTALL_POLICY !== "auto" && args.userApproved !== true) {
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
