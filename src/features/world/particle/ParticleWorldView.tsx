import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Crosshair, Dices } from "lucide-react";
import { ParticleWorldCanvas } from "./ParticleWorldCanvas";
import { ParticleRegionInspector } from "./ParticleRegionInspector";
import { generateParticleWorld } from "./generator";
import { useCityBuildStream } from "../useCityBuildStream";
import {
  buildKnowledgeWorldSpec,
  fetchKnowledgeCities,
  fetchWorldLinks,
  getCachedCamera,
  setCachedCamera,
  isDevMapTools,
  KNOWLEDGE_WORLD_SEED,
  type CitySummary,
  type WorldLink,
  type MapCamera,
} from "../knowledgeWorld";
import type { ParticleRegion } from "./types";

export interface ParticleWorldViewProps {
  onEnterCity?: (cityName: string, cityId?: string) => void;
  onFoundCityTopic?: (topic: string) => void;
  className?: string;
}

/** Fallback cities so the world never renders empty before first load. */
const FALLBACK_CITIES: CitySummary[] = [
  { id: "neural-networks", title: "Neural Networks", region: "Aethelgard Reach", level: 1, tags: ["deep-learning"] },
  { id: "transformers", title: "Transformers", region: "Aethelgard Reach", level: 2, tags: ["attention"] },
  { id: "stoicism", title: "Stoicism", region: "Obsidian Caldera", level: 1, tags: ["philosophy"] },
];

export function ParticleWorldView({
  onEnterCity,
  onFoundCityTopic,
  className = "",
}: ParticleWorldViewProps) {
  const [cities, setCities] = useState<CitySummary[]>(FALLBACK_CITIES);
  const [links, setLinks] = useState<WorldLink[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<ParticleRegion | null>(null);
  const [customSeed, setCustomSeed] = useState<number | undefined>(undefined);
  const [foundPrompt, setFoundPrompt] = useState<{ nx: number; ny: number; screenX: number; screenY: number } | null>(null);
  const [foundTopicText, setFoundTopicText] = useState("");
  const resetCameraRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { startCityBuild } = useCityBuildStream();
  const showDevTools = isDevMapTools();

  const refreshWorld = useCallback(async () => {
    try {
      const [fetchedCities, fetchedLinks] = await Promise.all([
        fetchKnowledgeCities().catch(() => null),
        fetchWorldLinks().catch(() => [] as WorldLink[]),
      ]);
      if (fetchedCities && fetchedCities.length > 0) setCities(fetchedCities);
      setLinks(fetchedLinks);
    } catch {
      // Keep fallback cities; world stays explorable offline.
    }
  }, []);

  useEffect(() => {
    void refreshWorld();
    const interval = setInterval(refreshWorld, 30000);
    const onFocus = () => void refreshWorld();
    const onCitiesChanged = () => void refreshWorld();
    window.addEventListener("focus", onFocus);
    window.addEventListener("polymax:cities-changed", onCitiesChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("polymax:cities-changed", onCitiesChanged);
    };
  }, [refreshWorld]);

  useEffect(() => {
    if (foundPrompt) setTimeout(() => inputRef.current?.focus(), 50);
  }, [foundPrompt]);

  // Single unified spec: one territory per city. Positions derive from
  // stable city IDs, so new cities never displace existing territories.
  const worldSpec = useMemo(() => buildKnowledgeWorldSpec(cities, links), [cities, links]);

  const specKey = useMemo(
    () => `${worldSpec.id}:${cities.map((c) => c.id).sort().join(",")}`,
    [worldSpec.id, cities]
  );

  const world = useMemo(() => {
    const perTerritory = Math.max(28, Math.min(85, Math.floor(900 / Math.max(1, cities.length))));
    return generateParticleWorld(worldSpec, {
      width: 1400,
      height: 850,
      customSeed: customSeed ?? KNOWLEDGE_WORLD_SEED,
      particlesPerTerritory: perTerritory,
    });
  }, [worldSpec, customSeed, cities.length]);

  // Restore camera position after returning from a city (stable per world).
  const [initialCamera] = useState<MapCamera | null>(() => getCachedCamera(specKey) || null);

  const handleSelectRegion = useCallback((region: ParticleRegion | null) => {
    setSelectedRegion(region);
  }, []);

  const handleSelectConnected = useCallback(
    (regionId: string) => {
      const target = worldSpec.regions.find((r) => r.id === regionId);
      if (target) setSelectedRegion(target);
    },
    [worldSpec]
  );

  const handleRandomizeSeed = useCallback(() => {
    setCustomSeed(Math.floor(Math.random() * 90000) + 10000);
  }, []);

  const triggerFoundCity = useCallback((screenX: number, screenY: number, containerRect: DOMRect) => {
    const nx = Math.min(Math.max((screenX - containerRect.left) / containerRect.width, 0), 1);
    const ny = Math.min(Math.max((screenY - containerRect.top) / containerRect.height, 0), 1);
    setSelectedRegion(null);
    setFoundPrompt({ nx, ny, screenX, screenY });
    setFoundTopicText("");
  }, []);

  const handleFoundCitySubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const topic = foundTopicText.trim();
      if (!topic || !foundPrompt) return;
      const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const newCityId = `city-${slug}`;
      startCityBuild(newCityId, topic, "deep", () => {
        window.dispatchEvent(new CustomEvent("polymax:cities-changed"));
        void refreshWorld();
      });
      onFoundCityTopic?.(topic);
      setFoundPrompt(null);
      setFoundTopicText("");
    },
    [foundTopicText, foundPrompt, startCityBuild, refreshWorld, onFoundCityTopic]
  );

  // Found a city on empty space: double-click or right-click the canvas.
  // Only canvas hits count (inspector and controls are excluded).
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).tagName !== "CANVAS") return;
      const rect = e.currentTarget.getBoundingClientRect();
      triggerFoundCity(e.clientX, e.clientY, rect);
    },
    [triggerFoundCity]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).tagName !== "CANVAS") return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      triggerFoundCity(e.clientX, e.clientY, rect);
    },
    [triggerFoundCity]
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setFoundPrompt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      className={`relative w-full h-full min-h-0 overflow-hidden select-none bg-[#06080e] ${className}`}
    >
      <ParticleWorldCanvas
        world={world}
        selectedRegionId={selectedRegion?.id}
        onSelectRegion={handleSelectRegion}
        initialCamera={initialCamera}
        onCameraChange={(cam) => setCachedCamera(specKey, cam)}
        onResetCameraReady={(fn) => {
          resetCameraRef.current = fn;
        }}
        className="w-full h-full"
      />

      {/* Dev-only tools (reset camera, reseed). Normal UI has no map controls. */}
      {showDevTools && (
        <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1 p-1 rounded-xl bg-[#0d1118]/90 border border-white/10 font-mono text-[11px] text-zinc-400">
          <button
            type="button"
            onClick={() => resetCameraRef.current?.()}
            className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            title="Reset camera"
          >
            <Crosshair size={14} />
          </button>
          <button
            type="button"
            onClick={handleRandomizeSeed}
            className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            title="Randomize seed (dev)"
          >
            <Dices size={14} />
          </button>
        </div>
      )}

      <ParticleRegionInspector
        region={selectedRegion}
        worldSpec={worldSpec}
        onClose={() => setSelectedRegion(null)}
        onSelectConnected={handleSelectConnected}
        onEnterCity={onEnterCity}
      />

      {/* Found-a-city inline prompt */}
      {foundPrompt ? (
        <div
          style={{ left: `${foundPrompt.screenX}px`, top: `${foundPrompt.screenY}px` }}
          className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-3"
        >
          <form
            onSubmit={handleFoundCitySubmit}
            className="flex items-center gap-2 p-1.5 rounded-xl bg-[#0d121c]/95 border border-[var(--accent-lime)]/40 shadow-2xl backdrop-blur-xl"
          >
            <input
              ref={inputRef}
              type="text"
              value={foundTopicText}
              onChange={(e) => setFoundTopicText(e.target.value)}
              placeholder="What do you want to explore?"
              className="w-56 px-3 py-1.5 bg-transparent text-xs text-white placeholder-muted-foreground outline-none font-mono"
            />
            <button
              type="submit"
              disabled={!foundTopicText.trim()}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent-lime)] text-black font-semibold text-xs hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              Explore
            </button>
            <button
              type="button"
              onClick={() => setFoundPrompt(null)}
              className="px-2 py-1 text-xs text-[#9aa5b8] hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
