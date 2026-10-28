import type { CityBuilderContext, CityBuilderStage } from "../types";
import type { CuratedData } from "./curate";

export interface StructuredCityData extends CuratedData {
  overview: string;
  glossary: Record<string, string>;
}

export const structureStage: CityBuilderStage<CuratedData, StructuredCityData> = {
  name: "structure",
  async run(curated: CuratedData, ctx: CityBuilderContext): Promise<StructuredCityData> {
    ctx.emitEvent({
      type: "stage.start",
      stage: "structure",
      progress: 0.75,
      message: `Structuring knowledge workspace, overview, and glossary for ${ctx.topic}...`,
    });

    const overview = `# ${ctx.topic}

## Workspace Overview
Welcome to the knowledge domain of **${ctx.topic}**.
This city workspace contains curated primary literature, interactive conceptual drills, and pedagogical quests.

### Core Disciplines & Invariants
- Theoretical foundation and mathematical models.
- Systems architecture and reproducible experimental design.
- Practical problem solving and continuous verification.

### Curated Bibliography
${curated.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url}) (${s.kind}, ${s.level}) - ${s.why}`).join("\n")}
`;

    const glossary: Record<string, string> = {
      Fundamentals: `The core axioms and mechanisms supporting ${ctx.topic}.`,
      Architecture: `The structural composition of models and systems in this domain.`,
      Verification: `Techniques to empirically test and prove system behavior.`,
    };

    return {
      ...curated,
      overview,
      glossary,
    };
  },
};
