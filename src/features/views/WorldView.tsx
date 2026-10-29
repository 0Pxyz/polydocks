import { ParticleWorldView } from "../world/particle/ParticleWorldView";
import type { CityPoint } from "../world/types";

export const INITIAL_GLOBAL_CITIES = [
  { id: "neural-networks", title: "Neural Networks", region: "Aethelgard Reach" },
  { id: "transformers", title: "Transformers", region: "Aethelgard Reach" },
  { id: "stoicism", title: "Stoicism", region: "Obsidian Caldera" },
  { id: "consciousness", title: "Consciousness", region: "Obsidian Caldera" },
  { id: "superposition", title: "Superposition", region: "Sunken Highlands" },
  { id: "entanglement", title: "Entanglement", region: "Sunken Highlands" },
];

export type { CityPoint };

interface WorldViewProps {
  onEnterCity: (cityName: string, cityId?: string) => void;
  onFoundCityTopic?: (topic: string, coords?: { x: number; y: number }) => void;
  buildingProgress?: Record<string, number>;
  activeCityId?: string;
}

/**
 * Primary Maps experience: the unified particle knowledge world.
 *
 * One map, every city as a territory. The Illustrated and ASCII renderers
 * remain archived in the codebase (features/world/illustrated + ascii) but
 * are not part of the primary interface.
 */
export function WorldView({ onEnterCity, onFoundCityTopic }: WorldViewProps) {
  return (
    <div className="relative w-full h-full min-h-0 overflow-hidden bg-[#06080e] select-none">
      <ParticleWorldView
        onEnterCity={onEnterCity}
        onFoundCityTopic={onFoundCityTopic ? (topic) => onFoundCityTopic(topic) : undefined}
        className="w-full h-full"
      />
    </div>
  );
}
