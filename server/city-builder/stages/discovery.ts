import type { SearchHit } from "../../discovery/tinyfish";
import type { CityBuilderContext, CityBuilderStage } from "../types";

export const discoveryStage: CityBuilderStage<void, SearchHit[]> = {
  name: "discovery",
  async run(_input: void, ctx: CityBuilderContext): Promise<SearchHit[]> {
    ctx.emitEvent({
      type: "stage.start",
      stage: "discovery",
      progress: 0.1,
      message: `Searching research papers and primary sources for "${ctx.topic}"...`,
    });

    const [paperHits, webHits] = await Promise.all([
      ctx.tinyfish.search(`${ctx.topic} foundational paper`, "research_paper", 3),
      ctx.tinyfish.search(`${ctx.topic} comprehensive guide`, "web", 3),
    ]);

    const combined = [...paperHits, ...webHits];

    // Emit event for discovered sources
    combined.forEach((hit) => {
      ctx.emitEvent({
        type: "source.found",
        stage: "discovery",
        progress: 0.25,
        message: `Discovered source: ${hit.title}`,
        payload: {
          title: hit.title,
          url: hit.url,
          domainType: hit.domainType,
        },
      });
    });

    return combined;
  },
};
