import { z } from "zod";
import { buildCityWorkspace } from "../../city-builder/pipeline";
import type { CityBuildEvent } from "../../city-builder/types";
import { TinyFishClient } from "../../discovery/tinyfish";
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
  }),
  async execute({ cityId, topic, depth = "deep" }) {
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
