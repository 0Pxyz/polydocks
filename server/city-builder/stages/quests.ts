import type { CityQuest } from "../../../src/features/world/types";
import type { CityBuilderContext, CityBuilderStage } from "../types";
import type { StructuredCityData } from "./structure";

export interface QuestsCityData extends StructuredCityData {
  quests: CityQuest[];
}

export const questsStage: CityBuilderStage<StructuredCityData, QuestsCityData> = {
  name: "quests",
  async run(structured: StructuredCityData, ctx: CityBuilderContext): Promise<QuestsCityData> {
    ctx.emitEvent({
      type: "stage.start",
      stage: "quests",
      progress: 0.85,
      message: `Planning progressive quest tree (Novice → Practitioner → Master)...`,
    });

    const primaryUrl = structured.sources[0]?.url;

    const quests: CityQuest[] = [
      {
        id: `quest-${ctx.cityId}-novice`,
        tier: "novice",
        title: `Foundations of ${ctx.topic}`,
        description: `Inspect the primary literature and formulate the core axioms of ${ctx.topic}.`,
        tasks: [
          `Read the introductory overview in "${structured.sources[0]?.title || ctx.topic}"`,
          `Identify 3 fundamental trade-offs or constraints`,
          `Formulate an intuitive summary in your workspace notes`,
        ],
        sourceUrl: primaryUrl,
      },
      {
        id: `quest-${ctx.cityId}-practitioner`,
        tier: "practitioner",
        title: `Architectural Mechanics & Proof`,
        description: `Examine the operational models and prove state invariants through rigorous analysis.`,
        tasks: [
          `Review the formal architecture in primary source documentation`,
          `Map input/output representations and state transformations`,
          `Complete the interactive concept drill`,
        ],
        sourceUrl: structured.sources[1]?.url || primaryUrl,
      },
      {
        id: `quest-${ctx.cityId}-master`,
        tier: "master",
        title: `Frontier Synthesis & Edge Cases`,
        description: `Synthesize open challenges at the cutting edge and resolve non-trivial boundary edge cases.`,
        tasks: [
          `Analyze frontier limitations and known failure modes`,
          `Formulate an empirical critique of current state-of-the-art`,
          `Document your synthesized insights in the city workspace`,
        ],
        sourceUrl: structured.sources[2]?.url || primaryUrl,
      },
    ];

    quests.forEach((q) => {
      ctx.emitEvent({
        type: "quest.created",
        stage: "quests",
        progress: 0.9,
        message: `Created quest [${q.tier.toUpperCase()}]: ${q.title}`,
        payload: q,
      });
    });

    return {
      ...structured,
      quests,
    };
  },
};
