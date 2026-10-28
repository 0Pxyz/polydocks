import { type CityBundle, CityBundleSchema } from "../../../src/features/world/types";
import { writeCityFile } from "../../workspace/cityWorkspace";
import type { CityBuilderContext, CityBuilderStage } from "../types";
import type { QuestsCityData } from "./quests";

export const persistStage: CityBuilderStage<QuestsCityData, CityBundle> = {
  name: "persist",
  async run(data: QuestsCityData, ctx: CityBuilderContext): Promise<CityBundle> {
    ctx.emitEvent({
      type: "stage.start",
      stage: "persist",
      progress: 0.95,
      message: `Persisting city files, feed.json, and notes in workspace/${ctx.cityId}...`,
    });

    // 1. Write notes/overview.md
    await writeCityFile(ctx.cityId, "notes/overview.md", data.overview);

    // 2. Write feed.json
    const feedJson = {
      cityId: ctx.cityId,
      updatedAt: new Date().toISOString(),
      items: data.sources.map((s) => ({
        title: s.title,
        url: s.url,
        kind: s.kind,
        summary: s.why,
        tags: [ctx.topic],
      })),
    };
    await writeCityFile(ctx.cityId, "feed.json", JSON.stringify(feedJson, null, 2));

    // 3. Write quests/tree.json
    await writeCityFile(ctx.cityId, "quests/tree.json", JSON.stringify(data.quests, null, 2));

    // 4. Write glossary
    await writeCityFile(ctx.cityId, "notes/glossary.json", JSON.stringify(data.glossary, null, 2));

    const bundle: CityBundle = {
      cityId: ctx.cityId,
      topic: ctx.topic,
      sources: data.sources,
      concepts: data.concepts,
      overview: data.overview,
      quests: data.quests,
      glossary: data.glossary,
      generatedAt: new Date().toISOString(),
    };

    const validated = CityBundleSchema.parse(bundle);

    ctx.emitEvent({
      type: "city.ready",
      stage: "persist",
      progress: 1.0,
      message: `City "${ctx.topic}" successfully synthesized and ready!`,
      payload: validated,
    });

    return validated;
  },
};
