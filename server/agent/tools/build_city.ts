import { z } from "zod";
import { buildCityWorkspace } from "../../city-builder/pipeline";
import type { CityBuildEvent } from "../../city-builder/types";
import { TinyFishClient } from "../../discovery/tinyfish";
import { db } from "../../workspace/db";
import type { AgentTool } from "./types";

export const build_city: AgentTool = {
  name: "build_city",
  description:
    "Fills a city workspace (overview, feed, quests, glossary) from a topic. Use only for explicit build asks; never beside manual search loops, and never for explanations.",
  schema: z.object({
    cityId: z.string().describe("Unique identifier for the city folder in workspace/"),
    topic: z.string().describe("Topic or discipline name to research and construct, e.g. 'Transformers' or 'Stoicism'"),
    depth: z
      .enum(["overview", "deep", "mastery"])
      .default("deep")
      .describe("Level of depth for discovery and quest planning"),
    region: z
      .string()
      .optional()
      .describe("Region the city belongs to (from plan_map). Defaults to Core Region."),
  }),
  async execute({ cityId, topic, depth = "deep", region }) {
    const tinyfish = new TinyFishClient();
    const emittedEvents: CityBuildEvent[] = [];

    const bundle = await buildCityWorkspace({
      cityId,
      topic,
      depth,
      tinyfish,
      emitEvent: (ev) => {
        emittedEvents.push(ev);
      },
    });

    // Register the city entity so the map, /api/cities metadata join, and
    // place_city verification all see the same state the files imply.
    // Files alone never constitute a city.
    try {
      db.query(
        `INSERT OR REPLACE INTO cities (id, title, region, level, tags, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(cityId, topic, region || "Core Region", 1, JSON.stringify([]), Math.floor(Date.now() / 1000));
    } catch (err) {
      return {
        success: false,
        error: `City workspace built but registration failed: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
        cityId,
      };
    }

    return {
      success: true,
      cityId: bundle.cityId,
      topic: bundle.topic,
      sourcesCount: bundle.sources.length,
      conceptsCount: bundle.concepts.length,
      questsCount: bundle.quests.length,
      overviewPreview: bundle.overview.slice(0, 240) + "...",
      status: "ready",
    };
  },
};
