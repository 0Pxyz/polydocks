import { z } from "zod";
import type { AgentTool } from "./types";
import { KIT_VERSION, KIT_RULES, kitIndex, kitDetails } from "../../plugin-kit/catalog";

/**
 * ui_catalog: queryable kit index for the agent (choose, don't recreate).
 * No args (or empty query) → version + rules + full index.
 * query="Button, EmptyState" → index + fichas for those parts.
 */
export const ui_catalog: AgentTool<{ query?: string }> = {
  name: "ui_catalog",
  description:
    "Plugin UI Kit catalog: Level 1 components and screen patterns with theme tokens. Call with no args for the index, then query specific names for props/examples. Always choose from the kit; never rebuild a component that exists.",
  schema: z.object({
    query: z
      .string()
      .optional()
      .describe("Comma-separated component/pattern names for detail cards (e.g. 'ListRow, EmptyState'). Omit for the index."),
  }),
  execute: async (args) => {
    const index = kitIndex();
    const q = (args.query || "").trim();
    if (!q) {
      return { version: KIT_VERSION, rules: KIT_RULES, count: index.length, index };
    }
    const names = q.split(",").map((s) => s.trim()).filter(Boolean);
    const details = kitDetails(names);
    const missing = names.filter((n) => !details.some((d) => d.name.toLowerCase() === n.toLowerCase()));
    return { version: KIT_VERSION, rules: KIT_RULES, index, details, missing };
  },
};
