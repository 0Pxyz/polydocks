import type { SearchHit } from "../../discovery/tinyfish";
import type { CityBuilderContext, CityBuilderStage } from "../types";

export interface FetchedSource extends SearchHit {
  markdown: string;
}

export const fetchStage: CityBuilderStage<SearchHit[], FetchedSource[]> = {
  name: "fetch",
  async run(hits: SearchHit[], ctx: CityBuilderContext): Promise<FetchedSource[]> {
    ctx.emitEvent({
      type: "stage.start",
      stage: "fetch",
      progress: 0.35,
      message: `Fetching content for ${hits.length} candidate sources...`,
    });

    const urls = hits.map((h) => h.url);
    const fetchResults = await ctx.tinyfish.fetch(urls);

    const fetchedMap = new Map(fetchResults.map((r) => [r.url, r.markdown]));

    return hits.map((hit) => ({
      ...hit,
      markdown: fetchedMap.get(hit.url) || `## ${hit.title}\n\n${hit.snippet || "Primary reference material."}`,
    }));
  },
};
