import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, ArrowSquareOut, UploadSimple } from "@phosphor-icons/react";
import type { MapSource } from "./types";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/motion";

export interface MapStylePickerProps {
  availableMaps: MapSource[];
  activeMapId: string;
  onSelectMap: (mapId: string) => void;
  onOpenUpload?: () => void;
  engineMode?: "illustrated" | "ascii";
  onToggleEngineMode?: (mode: "illustrated" | "ascii") => void;
  className?: string;
}

/**
 * MapStylePicker:
 * Frameless bottom-center row of 44px style thumbnails with accent ring selection,
 * engine mode switcher (Illustrated vs Procedural ASCII), transient name line, and "+" modal.
 */
export function MapStylePicker({
  availableMaps,
  activeMapId,
  onSelectMap,
  onOpenUpload,
  engineMode = "illustrated",
  onToggleEngineMode,
  className,
}: MapStylePickerProps) {
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [hoveredMapName, setHoveredMapName] = useState<string | null>(null);
  const isReduced = prefersReducedMotion();

  const activeMap = availableMaps.find((m) => m.id === activeMapId) || availableMaps[0];
  const displayName = hoveredMapName || activeMap?.name;

  return (
    <div
      className={cn(
        "absolute bottom-6 left-1/2 transform -translate-x-1/2 z-40 flex flex-col items-center select-none pointer-events-auto",
        className
      )}
    >
      {/* Engine Mode Toggle (Illustrated vs Procedural ASCII Experiment) */}
      {onToggleEngineMode && (
        <div className="flex items-center gap-1 mb-2 p-1 rounded-xl bg-[#0d1118]/90 border border-white/10 backdrop-blur-xl text-xs font-mono shadow-xl">
          <button
            type="button"
            onClick={() => onToggleEngineMode("illustrated")}
            className={cn(
              "px-3 py-1 rounded-lg transition-all cursor-pointer",
              engineMode === "illustrated"
                ? "bg-white/15 text-white font-medium shadow-sm"
                : "text-zinc-400 hover:text-white"
            )}
          >
            Illustrated
          </button>
          <button
            type="button"
            onClick={() => onToggleEngineMode("ascii")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer",
              engineMode === "ascii"
                ? "bg-[var(--accent-lime,#C8FF57)] text-black font-semibold shadow-md"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            )}
          >
            <span>ASCII Engine</span>
            <span className={cn(
              "text-[9px] uppercase font-bold px-1 py-0.5 rounded",
              engineMode === "ascii" ? "bg-black/20 text-black" : "bg-emerald-500/20 text-emerald-400"
            )}>
              Exp
            </span>
          </button>
        </div>
      )}

      {/* When in Illustrated Mode, show Thumbnails Capsule */}
      {engineMode === "illustrated" && (
        <>
          {/* Transient Active / Hovered Style Name Line */}
          <AnimatePresence mode="wait">
            <motion.div
              key={displayName}
              initial={isReduced ? { opacity: 1 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="mb-2 text-[12px] font-mono tracking-wider text-[#d1d6e2] font-semibold drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
            >
              {displayName}
            </motion.div>
          </AnimatePresence>

          {/* Capsule of 44px Thumbnails + Plus Tile */}
          <div className="flex items-center gap-2 p-1.5 rounded-[16px] bg-[#0d1118]/85 border border-white/10 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
        {availableMaps.map((map) => {
          const isSelected = map.id === activeMapId;

          return (
            <button
              key={map.id}
              type="button"
              onClick={() => onSelectMap(map.id)}
              onMouseEnter={() => setHoveredMapName(map.name)}
              onMouseLeave={() => setHoveredMapName(null)}
              className={cn(
                "group relative w-11 h-11 min-w-[44px] rounded-[10px] overflow-hidden transition-all duration-200 cursor-pointer focus:outline-none",
                isSelected
                  ? "ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-[#0d1118] scale-105 shadow-[0_0_12px_rgba(200,255,87,0.3)]"
                  : "opacity-60 hover:opacity-100 hover:scale-102"
              )}
              aria-label={`Select ${map.name} style`}
            >
              <img
                src={map.thumbnail}
                alt={map.name}
                className="w-full h-full object-cover"
                draggable={false}
              />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
            </button>
          );
        })}

        {/* Plus Tile */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPlusMenu((prev) => !prev)}
            aria-label="Add map or open creator"
            className={cn(
              "w-11 h-11 min-w-[44px] rounded-[10px] border border-dashed border-white/20 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/40 flex items-center justify-center text-[#9aa5b8] hover:text-white transition-all cursor-pointer focus:outline-none",
              showPlusMenu && "border-[var(--accent-lime)] text-[var(--accent-lime)]"
            )}
          >
            <Plus size={18} weight="bold" />
          </button>

          {/* Plus Popover */}
          <AnimatePresence>
            {showPlusMenu && (
              <motion.div
                initial={isReduced ? { opacity: 1 } : { opacity: 0, scale: 0.95, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-14 right-0 w-56 rounded-xl bg-[#0f141f] border border-white/10 shadow-2xl p-2 z-50 text-xs backdrop-blur-xl"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowPlusMenu(false);
                    onOpenUpload?.();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[#d1d6e2] hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                >
                  <UploadSimple size={16} className="text-[var(--accent-lime)]" />
                  <span>Upload Custom Map</span>
                </button>

                <a
                  href="https://azgaar.github.io/Fantasy-Map-Generator/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowPlusMenu(false)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[#d1d6e2] hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                >
                  <ArrowSquareOut size={16} className="text-[#38bdf8]" />
                  <span>Open Azgaar FMG</span>
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
