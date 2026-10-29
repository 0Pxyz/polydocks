import { z } from "zod";
import type { AgentTool } from "./types";
import type { AsciiWorldSpec, AsciiBiome } from "../../../src/features/world/ascii/types";

const BIOMES: [AsciiBiome, ...AsciiBiome[]] = [
  "plains",
  "mountains",
  "forest",
  "caldera",
  "desert",
  "ocean",
  "tundra",
];

export const plan_ascii_world: AgentTool = {
  name: "plan_ascii_world",
  description:
    "Drafts a renderer-independent ASCII world spec. Use only for explicit ASCII-map asks; for the real map use plan_map.",
  schema: z.object({
    subject: z.string().describe("The subject or field to map (e.g., 'Quantum Computing', 'Stoicism', 'Poker')"),
    regions: z
      .array(
        z.object({
          id: z.string().describe("Unique slug for the region, e.g. 'qubits'"),
          label: z.string().describe("Human readable title, e.g. 'Quantum Qubits'"),
          summary: z.string().describe("Short 1-2 sentence description of this domain"),
          biome: z.enum(BIOMES).describe("Terrain biome type"),
          landmark: z.string().describe("Single glyph or icon character, e.g. '▲', '✦', '⚛', '🏛'"),
          concepts: z.array(z.string()).describe("Key concepts belonging to this region"),
          connections: z.array(z.string()).describe("IDs of prerequisite or connected regions"),
        })
      )
      .optional()
      .describe("Optional pre-defined regions. If omitted, defaults are generated automatically."),
    seed: z.number().optional().describe("Optional numeric seed for deterministic procedural generation"),
  }),
  async execute({ subject, regions, seed }) {
    const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const activeSeed = seed !== undefined ? seed : Math.floor(Math.random() * 90000) + 10000;

    let worldRegions = regions;
    if (!worldRegions || worldRegions.length === 0) {
      worldRegions = [
        {
          id: `${slug}-foundations`,
          label: `${subject} Foundations`,
          summary: `Core foundational principles, axioms, and introductory models of ${subject}.`,
          biome: "plains",
          landmark: "◬",
          concepts: ["core-axioms", "terminology", "historical-context"],
          connections: [`${slug}-core`],
        },
        {
          id: `${slug}-core`,
          label: `${subject} Mechanics`,
          summary: `The operational engine and analytical techniques of ${subject}.`,
          biome: "mountains",
          landmark: "▲",
          concepts: ["functional-models", "dynamics", "methodology"],
          connections: [`${slug}-foundations`, `${slug}-advanced`],
        },
        {
          id: `${slug}-advanced`,
          label: `Advanced ${subject}`,
          summary: `Deep frontier theories, synthesis, and edge-case applications.`,
          biome: "caldera",
          landmark: "✦",
          concepts: ["frontier-theories", "synthesis", "open-problems"],
          connections: [`${slug}-core`],
        },
      ];
    }

    const worldSpec: AsciiWorldSpec = {
      id: slug,
      title: subject,
      subject,
      seed: activeSeed,
      description: `Procedural knowledge territory mapping the domain of ${subject}.`,
      regions: worldRegions,
      progression: {
        [worldRegions[0].id]: "mastered",
        ...(worldRegions[1] ? { [worldRegions[1].id]: "discovered" } : {}),
      },
    };

    return {
      success: true,
      world: worldSpec,
      regionCount: worldSpec.regions.length,
      message: `Planned semantic ASCII world for "${subject}" with ${worldSpec.regions.length} regions. Ready for procedural rendering.`,
    };
  },
};
