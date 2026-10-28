import { type CityBundle } from "../../src/features/world/types";
import { curateStage } from "./stages/curate";
import { discoveryStage } from "./stages/discovery";
import { fetchStage } from "./stages/fetch";
import { persistStage } from "./stages/persist";
import { questsStage } from "./stages/quests";
import { structureStage } from "./stages/structure";
import type { CityBuilderContext } from "./types";

export class CityBuilderPipeline {
  private discovery = discoveryStage;
  private fetch = fetchStage;
  private curate = curateStage;
  private structure = structureStage;
  private quests = questsStage;
  private persist = persistStage;

  /**
   * Executes the 6-stage city construction pipeline.
   */
  async run(ctx: CityBuilderContext): Promise<CityBundle> {
    try {
      // Stage 1: Discovery
      const searchHits = await this.discovery.run(undefined, ctx);

      // Stage 2: Fetch
      const fetchedSources = await this.fetch.run(searchHits, ctx);

      // Stage 3: Curate
      const curated = await this.curate.run(fetchedSources, ctx);

      // Stage 4: Structure
      const structured = await this.structure.run(curated, ctx);

      // Stage 5: Quests
      const withQuests = await this.quests.run(structured, ctx);

      // Stage 6: Persist
      const bundle = await this.persist.run(withQuests, ctx);

      return bundle;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      ctx.emitEvent({
        type: "error",
        message: `Pipeline failure: ${errorMsg}`,
      });
      throw err;
    }
  }
}

export const defaultCityPipeline = new CityBuilderPipeline();

export async function buildCityWorkspace(ctx: CityBuilderContext): Promise<CityBundle> {
  return defaultCityPipeline.run(ctx);
}
