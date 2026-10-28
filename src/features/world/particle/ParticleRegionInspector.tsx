import { motion, AnimatePresence } from "motion/react";
import { X, ArrowRight } from "lucide-react";
import type { ParticleRegion, ParticleWorldSpec, ParticleConcept } from "./types";
import { BIOME_PALETTES } from "./generator";
import { prefersReducedMotion } from "@/lib/motion";

export interface ParticleRegionInspectorProps {
  region: ParticleRegion | null;
  worldSpec: ParticleWorldSpec;
  onClose: () => void;
  onSelectConnected?: (regionId: string) => void;
  onEnterCity?: (cityName: string, cityId?: string) => void;
}

export function ParticleRegionInspector({
  region,
  worldSpec,
  onClose,
  onSelectConnected,
  onEnterCity,
}: ParticleRegionInspectorProps) {
  const isReduced = prefersReducedMotion();

  if (!region) return null;

  const palette = BIOME_PALETTES[region.biome] || BIOME_PALETTES.plains;

  // Connected region objects
  const connectedRegions = region.connections
    .map((connId) => worldSpec.regions.find((r) => r.id === connId))
    .filter(Boolean) as ParticleRegion[];

  // Normalized concepts
  const concepts: ParticleConcept[] = region.concepts.map((c) => {
    if (typeof c === "string") {
      return { id: c, label: c, status: "discovered" };
    }
    return c;
  });

  const handleEnterWorkspace = () => {
    onEnterCity?.(region.label, region.cityId || region.id);
  };

  return (
    <AnimatePresence>
      <motion.div
        key={region.id}
        initial={isReduced ? { opacity: 1 } : { opacity: 0, x: 20, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 20, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="absolute top-20 right-6 z-40 w-80 max-w-[calc(100vw-3rem)] rounded-2xl bg-[#0c1017]/95 border border-white/10 shadow-[0_24px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl p-5 select-none font-sans"
      >
        {/* Header: Landmark Icon, Region Title, and Close */}
        <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-mono"
              style={{ backgroundColor: `${palette.core}22`, color: palette.accent }}
            >
              {region.landmark}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">
                {region.label}
              </h3>
              <p className="text-[11px] font-mono text-zinc-400 capitalize">
                {region.biome} Territory
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close inspector"
          >
            <X size={15} />
          </button>
        </div>

        {/* Territory Summary */}
        <p className="text-xs text-zinc-300 leading-relaxed my-3 font-sans">
          {region.summary}
        </p>

        {/* Concepts List */}
        {concepts.length > 0 && (
          <div className="my-3 space-y-1.5">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
              Core Concepts
            </span>
            <div className="space-y-1">
              {concepts.map((concept) => (
                <div
                  key={concept.id}
                  className="p-2 rounded-lg bg-black/40 border border-white/[0.04]"
                >
                  <div className="text-xs font-medium text-zinc-200">
                    {concept.label}
                  </div>
                  {concept.description && (
                    <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                      {concept.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected Territories Links */}
        {connectedRegions.length > 0 && (
          <div className="my-3">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1.5">
              Connected Regions
            </span>
            <div className="flex flex-wrap gap-1.5">
              {connectedRegions.map((conn) => (
                <button
                  key={conn.id}
                  type="button"
                  onClick={() => onSelectConnected?.(conn.id)}
                  className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white text-[11px] font-mono transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>{conn.landmark}</span>
                  <span>{conn.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Enter City Workspace Action */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleEnterWorkspace}
            className="w-full py-2 px-3 rounded-xl bg-[var(--accent-lime,#C8FF57)] text-black font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-2 shadow-sm"
          >
            <span>Enter City Workspace</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
