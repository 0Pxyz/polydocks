import { useMemo, useState } from "react";
import { generateMapLayout } from "@/lib/mapgen/proceduralWorld";
import { WorldMapCanvas } from "../world/WorldMapCanvas";
import { useCityBuildStream } from "../world/useCityBuildStream";
import type { MapSpec, Point2D } from "../world/types";

export const DEFAULT_DEMO_SPEC: MapSpec = {
  id: "world-polymax-demo",
  seed: "meta-hackathon-2026",
  title: "The World of Knowledge",
  createdAt: new Date().toISOString(),
  regions: [
    {
      id: "ai",
      title: "Artificial Intelligence",
      topic: "Deep Learning & Neural Architectures",
      color: "#C8FF57",
      accentColor: "rgba(200, 255, 87, 0.25)",
      cities: [
        { id: "neural-networks", title: "Neural Networks", tags: ["deep learning", "math"], level: 1 },
        { id: "transformers", title: "Transformers", tags: ["llm", "attention"], level: 3 },
      ],
    },
    {
      id: "philosophy",
      title: "Philosophy & Mind",
      topic: "Epistemology & Classical Thought",
      color: "#57C8FF",
      accentColor: "rgba(87, 200, 255, 0.25)",
      cities: [
        { id: "stoicism", title: "Stoicism", tags: ["ethics", "virtue"], level: 1 },
        { id: "consciousness", title: "Consciousness", tags: ["qualia", "mind"], level: 4 },
      ],
    },
    {
      id: "quantum",
      title: "Quantum Mechanics",
      topic: "Subatomic Physics & Computing",
      color: "#FFC857",
      accentColor: "rgba(255, 200, 87, 0.25)",
      cities: [
        { id: "superposition", title: "Superposition", tags: ["states", "qubits"], level: 2 },
        { id: "entanglement", title: "Entanglement", tags: ["spooky action", "bell"], level: 5 },
      ],
    },
  ],
  connections: [
    { fromCityId: "neural-networks", toCityId: "transformers", kind: "highway" },
    { fromCityId: "stoicism", toCityId: "consciousness", kind: "trail" },
    { fromCityId: "superposition", toCityId: "entanglement", kind: "highway" },
  ],
};

interface WorldViewProps {
  onEnterCity: (cityName: string, cityId?: string) => void;
  onFoundCityTopic?: (topic: string) => void;
  spec?: MapSpec;
  buildingProgress?: Record<string, number>;
}

export function WorldView({
  onEnterCity,
  onFoundCityTopic,
  spec: initialSpec = DEFAULT_DEMO_SPEC,
  buildingProgress: externalProgress,
}: WorldViewProps) {
  const [spec, setSpec] = useState<MapSpec>(initialSpec);
  const { buildingProgress: streamProgress, startCityBuild } = useCityBuildStream();

  const mergedProgress = {
    ...streamProgress,
    ...externalProgress,
  };

  // Layout engine: deterministic, seeded layout
  const layout = useMemo(() => {
    return generateMapLayout(spec);
  }, [spec]);

  const handleFoundCity = (topic: string, _position: Point2D) => {
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const newCityId = `city-${slug}-${Date.now()}`;

    // Add city into the spec without moving any existing cities
    setSpec((prev) => {
      const updatedRegions = prev.regions.map((reg, idx) => {
        if (idx === 0) {
          return {
            ...reg,
            cities: [
              ...reg.cities,
              {
                id: newCityId,
                title: topic,
                tags: [slug],
                level: 1,
              },
            ],
          };
        }
        return reg;
      });

      return {
        ...prev,
        regions: updatedRegions,
      };
    });

    // Start live SSE city build stream
    startCityBuild(newCityId, topic);

    if (onFoundCityTopic) {
      onFoundCityTopic(topic);
    }
  };

  return (
    <div className="relative w-full h-full min-h-screen flex-1 overflow-hidden select-none">
      <WorldMapCanvas
        layout={layout}
        onEnterCity={(cityName, cityId) => onEnterCity(cityName, cityId)}
        onFoundCity={handleFoundCity}
        buildingProgress={mergedProgress}
        className="w-full h-full"
      />
    </div>
  );
}
