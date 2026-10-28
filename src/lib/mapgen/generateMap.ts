import { PRNG } from "./prng";
import type {
  CitySpec,
  MapBounds,
  MapGenOptions,
  MapSpec,
  Position2D,
  RegionSpec,
  RoadConnection,
} from "./types";

const THEME_PALETTE = [
  { color: "#C8FF57", accent: "rgba(200, 255, 87, 0.2)" }, // Neon Lime
  { color: "#57C8FF", accent: "rgba(87, 200, 255, 0.2)" }, // Electric Cyan
  { color: "#FF57C8", accent: "rgba(255, 87, 200, 0.2)" }, // Vivid Magenta
  { color: "#FFC857", accent: "rgba(255, 200, 87, 0.2)" }, // Radiant Amber
  { color: "#9D57FF", accent: "rgba(157, 87, 255, 0.2)" }, // Ultraviolet
  { color: "#57FF9D", accent: "rgba(87, 255, 157, 0.2)" }, // Emerald Mint
  { color: "#FF7657", accent: "rgba(255, 118, 87, 0.2)" }, // Coral Rose
  { color: "#578FFF", accent: "rgba(87, 143, 255, 0.2)" }, // Cerulean
];

const DEFAULT_INTERESTS = [
  "Quantum Computing",
  "Classical Philosophy",
  "Distributed Systems",
];

interface ConceptTemplate {
  name: string;
  tags: string[];
  level: number;
}

const KNOWLEDGE_TAXONOMY: Record<string, ConceptTemplate[]> = {
  quantum: [
    { name: "Superposition Citadel", tags: ["qubits", "linear-algebra", "bloch-sphere"], level: 1 },
    { name: "Entanglement Nexus", tags: ["bell-states", "epr-paradox", "teleportation"], level: 2 },
    { name: "Decoherence Plains", tags: ["noise", "quantum-error-correction", "density-matrix"], level: 3 },
    { name: "Shor Haven", tags: ["algorithms", "fourier-transform", "cryptography"], level: 4 },
  ],
  philosophy: [
    { name: "Logos Agora", tags: ["stoicism", "logic", "epistemology"], level: 1 },
    { name: "Amor Fati Sanctuary", tags: ["ethics", "nietzsche", "resilience"], level: 2 },
    { name: "Ataraxia Port", tags: ["mindfulness", "epictetus", "inner-citadel"], level: 3 },
    { name: "Dialectic Spire", tags: ["socratic-method", "hegel", "reason"], level: 4 },
  ],
  distributed: [
    { name: "Consensus Basin", tags: ["raft", "paxos", "leader-election"], level: 1 },
    { name: "Replication Harbor", tags: ["eventual-consistency", "vector-clocks", "cap-theorem"], level: 2 },
    { name: "Byzantine Keep", tags: ["fault-tolerance", "pbft", "cryptography"], level: 3 },
    { name: "Gossip Groves", tags: ["epidemic-protocols", "p2p", "membership"], level: 4 },
  ],
  neuroscience: [
    { name: "Synapse Basin", tags: ["action-potential", "neurotransmitters", "dendrites"], level: 1 },
    { name: "Plasticity Ridge", tags: ["ltp", "hebbian-learning", "neurogenesis"], level: 2 },
    { name: "Cortex Observatory", tags: ["visual-cortex", "sensory-mapping", "thalamus"], level: 3 },
    { name: "Cognition Peaks", tags: ["prefrontal", "working-memory", "executive-function"], level: 4 },
  ],
  machine: [
    { name: "Perceptron Gate", tags: ["weights", "backpropagation", "loss-functions"], level: 1 },
    { name: "Attention Valley", tags: ["transformers", "self-attention", "embeddings"], level: 2 },
    { name: "Latent Spire", tags: ["autoencoders", "diffusion", "manifold"], level: 3 },
    { name: "Reinforcement Arena", tags: ["q-learning", "policy-gradient", "markov-decision"], level: 4 },
  ],
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findTaxonomyMatch(topic: string): ConceptTemplate[] | null {
  const lower = topic.toLowerCase();
  for (const [key, templates] of Object.entries(KNOWLEDGE_TAXONOMY)) {
    if (lower.includes(key)) {
      return templates;
    }
  }
  return null;
}

function generateProceduralConcepts(topic: string, prng: PRNG): ConceptTemplate[] {
  const words = topic.split(/\s+/).filter((w) => w.length > 2);
  const baseName = words[0] || topic;
  const secondary = words[1] || "Core";

  const prefixes = ["Principles of", "Foundations of", "Advanced", "Frontiers in"];
  const suffixes = ["Agora", "Nexus", "Observatory", "Citadel", "Sanctuary", "Plains", "Spire"];

  return [
    {
      name: `${baseName} ${prng.pick(suffixes)}`,
      tags: [slugify(baseName), "foundations", "level-1"],
      level: 1,
    },
    {
      name: `${secondary} ${prng.pick(suffixes)}`,
      tags: [slugify(secondary), "intermediate", "patterns"],
      level: 2,
    },
    {
      name: `${prng.pick(prefixes)} ${baseName}`,
      tags: [slugify(topic), "synthesis", "advanced"],
      level: 3,
    },
  ];
}

function calculateDistance(a: Position2D, b: Position2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Deterministically generates an interactive world map specification from learning interests.
 */
export function generateMap(
  interests: string[] = DEFAULT_INTERESTS,
  seed: string = "polymax-genesis",
  options: MapGenOptions = {}
): MapSpec {
  const cleanInterests = interests.length > 0
    ? interests.map((s) => s.trim()).filter(Boolean)
    : DEFAULT_INTERESTS;

  const prng = new PRNG(seed);
  const regionCount = cleanInterests.length;

  const canvasRadius = options.canvasRadius ?? (regionCount <= 2 ? 600 : regionCount * 260 + 300);
  const minCityDistance = options.minCityDistance ?? 120;
  const citiesPerRegion = options.citiesPerRegion ?? 3;

  const regions: RegionSpec[] = [];
  const cities: CitySpec[] = [];
  const connections: RoadConnection[] = [];

  // 1. Position Regions deterministically in a balanced circular/spiral layout
  cleanInterests.forEach((interest, index) => {
    const regionId = slugify(interest) || `region-${index + 1}`;
    let center: Position2D;

    if (regionCount === 1) {
      center = { x: 0, y: 0 };
    } else if (regionCount === 2) {
      const offsetX = Math.round(canvasRadius * 0.45);
      center = {
        x: index === 0 ? -offsetX : offsetX,
        y: Math.round(prng.range(-60, 60)),
      };
    } else {
      const angle = (2 * Math.PI * index) / regionCount + prng.range(-0.15, 0.15);
      const dist = prng.range(canvasRadius * 0.55, canvasRadius * 0.85);
      center = {
        x: Math.round(dist * Math.cos(angle)),
        y: Math.round(dist * Math.sin(angle)),
      };
    }

    const paletteItem = THEME_PALETTE[index % THEME_PALETTE.length];
    const regionRadius = Math.round(prng.range(260, 340));

    regions.push({
      id: regionId,
      title: interest,
      topic: interest,
      center,
      radius: regionRadius,
      color: paletteItem.color,
      accentColor: paletteItem.accent,
      cities: [],
    });
  });

  // 2. Generate and place cities within their corresponding regions
  regions.forEach((region) => {
    const matchedTemplates = findTaxonomyMatch(region.topic);
    const templates = matchedTemplates || generateProceduralConcepts(region.topic, prng);
    const cityCount = Math.min(citiesPerRegion, templates.length);

    const regionCities: CitySpec[] = [];

    for (let i = 0; i < cityCount; i++) {
      const tmpl = templates[i];
      const cityId = `${region.id}-${slugify(tmpl.name)}`;

      // Rejection sampling for collision-free city coordinates inside region
      let pos: Position2D = { x: region.center.x, y: region.center.y };
      let placed = false;
      const maxAttempts = 60;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const angle = prng.range(0, 2 * Math.PI);
        const maxDist = region.radius - 80;
        const dist = prng.range(50, Math.max(60, maxDist));

        const candidate: Position2D = {
          x: Math.round(region.center.x + dist * Math.cos(angle)),
          y: Math.round(region.center.y + dist * Math.sin(angle)),
        };

        // Check clearance with existing cities across all regions
        const tooClose = cities.some(
          (existing) => calculateDistance(existing.position, candidate) < minCityDistance
        );

        if (!tooClose) {
          pos = candidate;
          placed = true;
          break;
        }
      }

      // Fallback: If densely packed, offset from region center deterministically
      if (!placed) {
        const angle = (2 * Math.PI * i) / cityCount;
        pos = {
          x: Math.round(region.center.x + (minCityDistance + 20) * Math.cos(angle)),
          y: Math.round(region.center.y + (minCityDistance + 20) * Math.sin(angle)),
        };
      }

      const city: CitySpec = {
        id: cityId,
        title: tmpl.name,
        regionId: region.id,
        level: tmpl.level || i + 1,
        position: pos,
        tags: tmpl.tags,
        description: `Knowledge domain exploring ${tmpl.name} in the field of ${region.title}.`,
        questCount: prng.int(2, 5),
      };

      cities.push(city);
      regionCities.push(city);
      region.cities.push(city.id);
    }

    // 3. Intra-region road network (MST connecting cities in the cluster)
    if (regionCities.length > 1) {
      for (let i = 0; i < regionCities.length - 1; i++) {
        const from = regionCities[i];
        const to = regionCities[i + 1];
        connections.push({
          fromCityId: from.id,
          toCityId: to.id,
          distance: Math.round(calculateDistance(from.position, to.position)),
          kind: i === 0 ? "highway" : "trail",
        });
      }
    }
  });

  // 4. Inter-region bridges connecting neighboring regions
  if (regions.length > 1) {
    for (let i = 0; i < regions.length; i++) {
      const regA = regions[i];
      const regB = regions[(i + 1) % regions.length];

      // Find the pair of cities with minimum distance between region A and region B
      let bestPair: [CitySpec, CitySpec] | null = null;
      let minPairDist = Number.POSITIVE_INFINITY;

      const citiesA = cities.filter((c) => c.regionId === regA.id);
      const citiesB = cities.filter((c) => c.regionId === regB.id);

      for (const ca of citiesA) {
        for (const cb of citiesB) {
          const d = calculateDistance(ca.position, cb.position);
          if (d < minPairDist) {
            minPairDist = d;
            bestPair = [ca, cb];
          }
        }
      }

      if (bestPair) {
        connections.push({
          fromCityId: bestPair[0].id,
          toCityId: bestPair[1].id,
          distance: Math.round(minPairDist),
          kind: "bridge",
        });
      }
    }
  }

  // 5. Calculate global bounding box
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  regions.forEach((r) => {
    minX = Math.min(minX, r.center.x - r.radius);
    maxX = Math.max(maxX, r.center.x + r.radius);
    minY = Math.min(minY, r.center.y - r.radius);
    maxY = Math.max(maxY, r.center.y + r.radius);
  });

  cities.forEach((c) => {
    minX = Math.min(minX, c.position.x - 60);
    maxX = Math.max(maxX, c.position.x + 60);
    minY = Math.min(minY, c.position.y - 60);
    maxY = Math.max(maxY, c.position.y + 60);
  });

  const padding = 100;
  minX -= padding;
  maxX += padding;
  minY -= padding;
  maxY += padding;

  const bounds: MapBounds = {
    minX: Math.round(minX),
    maxX: Math.round(maxX),
    minY: Math.round(minY),
    maxY: Math.round(maxY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  };

  return {
    seed,
    title: cleanInterests.length === 1 ? cleanInterests[0] : `${cleanInterests[0]} & Realms`,
    regions,
    cities,
    connections,
    bounds,
    createdAt: new Date().toISOString(),
  };
}
