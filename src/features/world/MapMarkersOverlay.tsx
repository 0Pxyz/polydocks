import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { CityPoint, MapRegionSpec } from "./types";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/motion";

export interface MapMarkersOverlayProps {
  regions?: MapRegionSpec[];
  cities: CityPoint[];
  zoom: number;
  mapToViewport: (nx: number, ny: number) => { x: number; y: number };
  onSelectCity?: (cityId: string) => void;
  selectedCityId?: string;
  buildingProgress?: Record<string, number>;
}

/**
 * MapMarkersOverlay:
 * High-performance vector marker layer with semantic zoom culling,
 * accessible interactive buttons, status states (undiscovered, building, discovered, mastered),
 * and wide-tracked uppercase territory typography.
 */
export function MapMarkersOverlay({
  regions = [],
  cities,
  zoom,
  mapToViewport,
  onSelectCity,
  selectedCityId,
  buildingProgress = {},
}: MapMarkersOverlayProps) {
  const [hoveredCityId, setHoveredCityId] = useState<string | null>(null);
  const isReduced = prefersReducedMotion();

  // Semantic zoom thresholds
  const showRegionLabels = zoom < 2.4;
  const showAllCityLabels = zoom >= 1.35;

  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      {/* 1. Region Labels (Territory typography in wide-tracked caps) */}
      <AnimatePresence>
        {showRegionLabels &&
          regions.map((region) => {
            const pos = mapToViewport(region.cx, region.cy);
            // Region label opacity fades as camera zooms in closer
            const labelOpacity = Math.max(0.25, Math.min(0.85, 2.2 - zoom * 0.6));

            return (
              <motion.div
                key={region.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: labelOpacity }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none"
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                }}
              >
                <span
                  className="text-[12px] sm:text-[14px] uppercase tracking-wider font-semibold text-white/70"
                  style={{
                    color: region.color ? region.color : "rgba(255,255,255,0.7)",
                  }}
                >
                  {region.name}
                </span>
              </motion.div>
            );
          })}
      </AnimatePresence>

      {/* City Markers */}
      {cities.map((city) => {
        const pos = mapToViewport(city.x, city.y);
        const isSelected = selectedCityId === city.cityId;
        const isHovered = hoveredCityId === city.cityId;
        const isBuilding = city.status === "building";
        const isMastered = city.status === "mastered";
        const isDiscovered = city.status === "discovered";
        const progress = buildingProgress[city.cityId] ?? (isBuilding ? 45 : 100);

        const showLabel = isHovered || isSelected || showAllCityLabels;

        return (
          <div
            key={city.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-auto"
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
            }}
          >
            {/* Real Accessible Button */}
            <button
              type="button"
              data-city-id={city.cityId}
              onClick={() => onSelectCity?.(city.cityId)}
              onMouseEnter={() => setHoveredCityId(city.cityId)}
              onMouseLeave={() => setHoveredCityId(null)}
              onFocus={() => setHoveredCityId(city.cityId)}
              onBlur={() => setHoveredCityId(null)}
              aria-label={`${city.title || city.cityId} (${city.status})`}
              className={cn(
                "relative group flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-lime)]",
                "w-7 h-7 sm:w-8 sm:h-8"
              )}
            >
              {/* Outer Glow & Status Rings */}
              {isMastered && (
                <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-pulse" />
              )}

              {isBuilding && (
                <svg
                  className="absolute inset-0 w-full h-full -rotate-90"
                  viewBox="0 0 32 32"
                >
                  <circle
                    cx="16"
                    cy="16"
                    r="13"
                    className="stroke-[#222734]"
                    strokeWidth="2.5"
                    fill="none"
                  />
                  <circle
                    cx="16"
                    cy="16"
                    r="13"
                    className="stroke-[var(--accent-lime)] transition-all duration-300"
                    strokeWidth="2.5"
                    strokeDasharray={81.68}
                    strokeDashoffset={81.68 - (81.68 * progress) / 100}
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              )}

              {/* Entrance Ring Ping for Discovered / Building */}
              {!isReduced && isDiscovered && (
                <span className="absolute w-full h-full rounded-full bg-[var(--accent-lime)]/30 animate-ping opacity-60 pointer-events-none" />
              )}

              {/* Core Marker Glyph (Dot with Accent Ring) */}
              <div
                className={cn(
                  "w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 transition-all duration-200",
                  city.status === "undiscovered" &&
                    "bg-[#161a22] border-[#4b5563] text-transparent hover:border-white",
                  isBuilding &&
                    "bg-[#0d121c] border-[var(--accent-lime)] shadow-[0_0_10px_rgba(200,255,87,0.5)]",
                  isDiscovered &&
                    "bg-[var(--accent-lime)] border-[#0d121c] shadow-[0_0_12px_rgba(200,255,87,0.6)]",
                  isMastered &&
                    "bg-amber-400 border-[#0d121c] shadow-[0_0_14px_rgba(251,191,36,0.7)]",
                  isSelected && "ring-2 ring-white ring-offset-2 ring-offset-[#06080e]"
                )}
              />
            </button>

            {/* City Label Tag with collision culling */}
            <AnimatePresence>
              {showLabel && (
                <motion.div
                  initial={isReduced ? { opacity: 1 } : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="pointer-events-none absolute -bottom-7 whitespace-nowrap z-30"
                >
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded font-mono text-[11px] font-semibold tracking-wider transition-all shadow-lg",
                      isSelected
                        ? "bg-[var(--accent-lime)] text-black shadow-[0_0_12px_rgba(200,255,87,0.4)]"
                        : "bg-[#0f141d]/90 text-[#e2e8f0] border border-white/10 backdrop-blur-md"
                    )}
                  >
                    {city.title || city.cityId}
                    {isBuilding && ` (${progress}%)`}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
