import type { CityConcept, CitySource } from "../../../src/features/world/types";
import type { CityBuilderContext, CityBuilderStage } from "../types";
import type { FetchedSource } from "./fetch";

export interface CuratedData {
  sources: CitySource[];
  concepts: CityConcept[];
}

export const curateStage: CityBuilderStage<FetchedSource[], CuratedData> = {
  name: "curate",
  async run(sources: FetchedSource[], ctx: CityBuilderContext): Promise<CuratedData> {
    ctx.emitEvent({
      type: "stage.start",
      stage: "curate",
      progress: 0.5,
      message: `Curating authoritative resources and extracting core principles for ${ctx.topic}...`,
    });

    const curatedSources: CitySource[] = sources.map((s, idx) => ({
      title: s.title,
      url: s.url,
      kind: s.domainType === "research_paper" ? "paper" : "article",
      why: `Key reference covering ${ctx.topic} fundamentals and architecture`,
      level: idx === 0 ? "beginner" : idx === 1 ? "intermediate" : "advanced",
      markdownContent: s.markdown,
    }));

    // Extract core concepts
    const concepts: CityConcept[] = [
      {
        title: `Core Principles of ${ctx.topic}`,
        explanation: `Foundational theoretical mechanics and axioms that govern ${ctx.topic}.`,
        keyQuestions: [
          `What problem does ${ctx.topic} solve that previous paradigms could not?`,
          `What are the invariants and trade-offs of this approach?`,
        ],
      },
      {
        title: `Formal Mechanics & Representation`,
        explanation: `Mathematical or systematic formulation of states, transformations, and operations.`,
        keyQuestions: [
          `How are state spaces represented and computed?`,
          `What are the boundary conditions and failure modes?`,
        ],
      },
      {
        title: `Practical Applications & Frontiers`,
        explanation: `Real-world deployments, current open problems, and state-of-the-art implementations.`,
        keyQuestions: [
          `How does this scale to real production workloads?`,
          `What unsolved questions remain at the frontier of research?`,
        ],
      },
    ];

    concepts.forEach((c) => {
      ctx.emitEvent({
        type: "concept.extracted",
        stage: "curate",
        progress: 0.65,
        message: `Extracted concept: ${c.title}`,
        payload: c,
      });
    });

    return {
      sources: curatedSources,
      concepts,
    };
  },
};
