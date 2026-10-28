import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { BUNDLED_MAPS } from "../world/bundledMaps";
import { IllustratedWorldMap } from "../world/IllustratedWorldMap";
import { MapMarkersOverlay } from "../world/MapMarkersOverlay";
import { MapStylePicker } from "../world/MapStylePicker";
import { syncCitiesToMap, placeCityOnMap } from "../world/placement";
import { isPointOnLand } from "../world/landmask";
import { useCityBuildStream } from "../world/useCityBuildStream";
import type { CityPoint, MapSource } from "../world/types";
import { prefersReducedMotion } from "@/lib/motion";

export const INITIAL_GLOBAL_CITIES = [
  { id: "neural-networks", title: "Neural Networks", region: "Aethelgard Reach" },
  { id: "transformers", title: "Transformers", region: "Aethelgard Reach" },
  { id: "stoicism", title: "Stoicism", region: "Obsidian Caldera" },
  { id: "consciousness", title: "Consciousness", region: "Obsidian Caldera" },
  { id: "superposition", title: "Superposition", region: "Sunken Highlands" },
  { id: "entanglement", title: "Entanglement", region: "Sunken Highlands" },
];

interface WorldViewProps {
  onEnterCity: (cityName: string, cityId?: string) => void;
  onFoundCityTopic?: (topic: string, coords?: { x: number; y: number }) => void;
  buildingProgress?: Record<string, number>;
  activeCityId?: string;
}

export function WorldView({
  onEnterCity,
  onFoundCityTopic,
  buildingProgress: externalProgress,
  activeCityId,
}: WorldViewProps) {
  const [activeMapId, setActiveMapId] = useState<string>("gloom");
  const [cityPoints, setCityPoints] = useState<CityPoint[]>([]);
  const [isFlyingIn, setIsFlyingIn] = useState<boolean>(false);
  const [targetCityId, setTargetCityId] = useState<string | null>(null);

  // Found a city inline input state
  const [foundCityPrompt, setFoundCityPrompt] = useState<{
    nx: number;
    ny: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [waterNudge, setWaterNudge] = useState<{ screenX: number; screenY: number } | null>(null);
  const [foundTopicText, setFoundTopicText] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchTimerRef = useRef<any>(null);
  const { buildingProgress: streamProgress, startCityBuild } = useCityBuildStream();
  const isReduced = prefersReducedMotion();

  const mergedProgress = {
    ...streamProgress,
    ...externalProgress,
  };

  const activeMap: MapSource = useMemo(() => {
    return BUNDLED_MAPS.find((m) => m.id === activeMapId) || BUNDLED_MAPS[0];
  }, [activeMapId]);

  // Sync cities whenever map changes
  useEffect(() => {
    setCityPoints((prev) => syncCitiesToMap(activeMap, prev, INITIAL_GLOBAL_CITIES));
  }, [activeMap]);

  // Focus input when foundCityPrompt opens
  useEffect(() => {
    if (foundCityPrompt) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [foundCityPrompt]);

  // Handle City Selection with 600ms camera fly-in
  const handleSelectCity = (cityId: string) => {
    const point = cityPoints.find((p) => p.cityId === cityId);
    if (!point) return;

    setTargetCityId(cityId);
    setIsFlyingIn(true);

    if (isReduced) {
      onEnterCity(point.title || cityId, cityId);
      setIsFlyingIn(false);
      return;
    }

    const timer = setTimeout(() => {
      onEnterCity(point.title || cityId, cityId);
      setIsFlyingIn(false);
    }, 600);

    return () => clearTimeout(timer);
  };

  // Found a city submission
  const handleFoundCitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundTopicText.trim() || !foundCityPrompt) return;

    const topic = foundTopicText.trim();
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const newCityId = `city-${slug}-${Date.now()}`;

    // Deterministically place on current map
    const placement = placeCityOnMap(activeMap, cityPoints, {
      cityId: newCityId,
      title: topic,
      x: foundCityPrompt.nx,
      y: foundCityPrompt.ny,
    });

    if (placement.status === "placed") {
      setCityPoints((prev) => [...prev, placement.point]);
      startCityBuild(newCityId, topic);
      onFoundCityTopic?.(topic, { x: foundCityPrompt.nx, y: foundCityPrompt.ny });
    }

    setFoundCityPrompt(null);
    setFoundTopicText("");
  };

  // Trigger found a city prompt or water nudge
  const triggerFoundCity = (screenX: number, screenY: number, containerRect: DOMRect) => {
    const nx = Math.min(Math.max((screenX - containerRect.left) / containerRect.width, 0), 1);
    const ny = Math.min(Math.max((screenY - containerRect.top) / containerRect.height, 0), 1);

    if (!isPointOnLand(activeMapId, nx, ny)) {
      setWaterNudge({ screenX, screenY });
      setFoundCityPrompt(null);
      setTimeout(() => setWaterNudge(null), 2500);
      return;
    }

    setWaterNudge(null);
    setFoundCityPrompt({ nx, ny, screenX, screenY });
    setFoundTopicText("");
  };

  // Right-click on map
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    triggerFoundCity(e.clientX, e.clientY, rect);
  };

  // Long-press touch listeners
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };

    touchTimerRef.current = setTimeout(() => {
      if (touchStartRef.current) {
        triggerFoundCity(touchStartRef.current.x, touchStartRef.current.y, rect);
      }
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dist = Math.hypot(touch.clientX - touchStartRef.current.x, touch.clientY - touchStartRef.current.y);
    if (dist > 10) {
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      touchStartRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    touchStartRef.current = null;
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative w-full h-full min-h-screen flex-1 overflow-hidden select-none bg-[#06080e]"
    >
      {/* Illustrated Map Canvas */}
      <motion.div
        animate={{
          scale: isFlyingIn ? 1.8 : 1.0,
          filter: activeCityId ? "blur(12px) brightness(0.55)" : "blur(0px) brightness(1)",
        }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full h-full"
      >
        <IllustratedWorldMap
          mapSource={activeMap}
          className="w-full h-full"
          renderOverlay={({ mapToViewport, zoom }) => (
            <MapMarkersOverlay
              regions={activeMap.regions}
              cities={cityPoints.filter((p) => p.mapId === activeMap.id)}
              zoom={zoom}
              mapToViewport={mapToViewport}
              onSelectCity={handleSelectCity}
              selectedCityId={targetCityId || activeCityId}
              buildingProgress={mergedProgress}
            />
          )}
        />
      </motion.div>

      {/* Style Picker (Frameless Bottom-Center) */}
      {!activeCityId && (
        <MapStylePicker
          availableMaps={BUNDLED_MAPS}
          activeMapId={activeMapId}
          onSelectMap={setActiveMapId}
        />
      )}

      {/* Found-a-city Inline Input Prompt */}
      <AnimatePresence>
        {foundCityPrompt && (
          <motion.div
            initial={isReduced ? { opacity: 1 } : { opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.15 }}
            style={{
              left: `${foundCityPrompt.screenX}px`,
              top: `${foundCityPrompt.screenY}px`,
            }}
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
                onClick={() => setFoundCityPrompt(null)}
                className="px-2 py-1 text-xs text-[#9aa5b8] hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </form>
          </motion.div>
        )}

        {/* Water Click Nudge */}
        {waterNudge && (
          <motion.div
            initial={isReduced ? { opacity: 1 } : { opacity: 0, scale: 0.9, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              left: `${waterNudge.screenX}px`,
              top: `${waterNudge.screenY}px`,
            }}
            className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-3 pointer-events-none"
          >
            <div className="px-3 py-1.5 rounded-lg bg-[#0e131d]/95 border border-sky-500/40 text-sky-300 font-mono text-[11px] font-medium shadow-xl backdrop-blur-md">
              Pick a spot on land
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
