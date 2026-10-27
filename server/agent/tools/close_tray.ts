import { z } from "zod";
import type { AgentTool } from "./types";

export const close_tray: AgentTool<Record<string, never>> = {
  name: "close_tray",
  description: "Closes the expanded dock tray, returning focus to the underlying World or City view.",
  schema: z.object({}),
  execute: async () => {
    return {
      success: true,
      action: "tray.close",
    };
  },
};
