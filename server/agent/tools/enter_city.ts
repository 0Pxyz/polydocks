import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import type { AgentTool } from "./types";
import { db } from "../../workspace/db";

/**
 * Enters a city workspace in the UI (world -> city view). Opening a tab
 * alone does NOT enter the city: without this, city content opens in the
 * global scope and shows nothing. Always enter first when the user asks to
 * see, open, or work with something inside a city.
 */
export const enter_city: AgentTool<{ cityId: string }> = {
  name: "enter_city",
  description:
    "Enters a city workspace in the UI (switches the view into the city). Required before showing city content: open_tab alone stays in the global scope and shows nothing from the city. Fails when the city does not exist.",
  schema: z.object({
    cityId: z.string().describe("City workspace id (workspace folder name, e.g. 'biohacking', 'stoicism')"),
  }),
  execute: async (args) => {
    const cityId = (args.cityId || "").trim();
    if (!cityId) {
      return { error: "enter_city requires a cityId.", retryable: false };
    }

    let exists = false;
    try {
      const row = db.query("SELECT id FROM cities WHERE id = ?").get(cityId) as { id: string } | null;
      exists = Boolean(row);
    } catch {
      exists = false;
    }
    if (!exists) {
      try {
        exists = fs.statSync(path.resolve(process.cwd(), "workspace", cityId)).isDirectory();
      } catch {
        exists = false;
      }
    }
    if (!exists) {
      return {
        error: `Cannot enter "${cityId}": no city workspace or registration found. Build it first with build_city.`,
        retryable: true,
        hint: "Run build_city for the topic, then enter_city with the same cityId.",
        cityId,
      };
    }

    return {
      success: true,
      action: "city.enter",
      cityId,
      message: `Entered city workspace "${cityId}".`,
    };
  },
};
