import { z } from "zod";
import type { AgentTool } from "./types";

export const close_tray: AgentTool<Record<string, never>> = {
  name: "close_tray",
  description: "Collapses the dock tray back to the map. Use when the surface should close; do not use to delete anything (close is not delete).",
  schema: z.object({}),
  execute: async () => {
    return {
      success: true,
      action: "tray.close",
    };
  },
};
