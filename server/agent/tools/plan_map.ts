import { z } from "zod";
import { type MapSpec, MapSpecSchema } from "../../../src/features/world/types";
import type { AgentTool } from "./types";

export const plan_map: AgentTool = {
  name: "plan_map",
  description:
    "Plans or expands the procedural world knowledge map with new regions and topic cities based on user interests. Only call when the user explicitly requests to create or map a new knowledge territory, domain, or world map.",
  schema: z.object({
    interests: z.array(z.string()).describe("List of topics or domains to learn, e.g. ['Machine Learning', 'Quantum Physics']"),
    existingSpec: z.any().optional().describe("Existing semantic MapSpec to expand without disturbing established territories"),
  }),
  async execute({ interests, existingSpec }) {
    const seed = existingSpec?.seed || `polymax-${Date.now()}`;
    const baseRegions = existingSpec?.regions ? [...existingSpec.regions] : [];

    // Map each new interest to a region and cities
    interests.forEach((interest: string) => {
      const regId = `reg-${interest.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      if (baseRegions.some((r) => r.id === regId)) return;

      const slug = interest.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      baseRegions.push({
        id: regId,
        title: interest,
        topic: `${interest} Core Concepts`,
        cities: [
          {
            id: `city-${slug}-foundations`,
            title: `${interest} Foundations`,
            tags: [slug, "theory"],
            level: 1,
            description: `Core foundational axioms and paradigms of ${interest}.`,
          },
          {
            id: `city-${slug}-advanced`,
            title: `Advanced ${interest}`,
            tags: [slug, "advanced"],
            level: 3,
            description: `Deep operational mechanics, proofs, and real-world synthesis.`,
          },
        ],
      });
    });

    const spec: MapSpec = {
      id: existingSpec?.id || `world-${Date.now()}`,
      seed,
      title: existingSpec?.title || "The World of Knowledge",
      regions: baseRegions,
      connections: existingSpec?.connections || [],
      createdAt: new Date().toISOString(),
    };

    const validated = MapSpecSchema.parse(spec);
    return {
      success: true,
      spec: validated,
      regionCount: validated.regions.length,
      cityCount: validated.regions.reduce((acc, r) => acc + r.cities.length, 0),
    };
  },
};
