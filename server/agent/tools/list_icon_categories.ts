import { z } from "zod";
import type { AgentTool } from "./types";
import { listCategories } from "../../icons/catalog";

export const list_icon_categories: AgentTool<Record<string, never>> = {
  name: "list_icon_categories",
  description:
    "Lists all available icon categories in the renderable dock icon catalog with the count of icons per category. Use to browse before calling search_icons.",
  schema: z.object({}),
  execute: async () => {
    const categories = listCategories();
    return {
      totalCategories: categories.length,
      categories,
    };
  },
};
