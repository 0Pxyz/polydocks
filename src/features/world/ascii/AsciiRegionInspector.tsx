import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Compass, X } from "@phosphor-icons/react";
import type { AsciiRegion } from "./types";
import { prefersReducedMotion } from "@/lib/motion";

export interface AsciiRegionInspectorProps {
  region: AsciiRegion | null;
  onClose: () => void;
  onSelectConnectedRegion: (regionId: string) => void;
  onEnterCity?: (cityName: string, cityId?: string) => void;
}

export function AsciiRegionInspector({
  region,
  onClose,
  onSelectConnectedRegion,
  onEnterCity,
}: AsciiRegionInspectorProps) {
  const isReduced = prefersReducedMotion();

  return (
    <AnimatePresence>
      {region && (
        <motion.div
          key={region.id}
          initial={isReduced ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={isReduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-6 left-6 z-40 w-96 max-w-[calc(100vw-3rem)] p-5 rounded-2xl bg-[#0c1017]/95 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl text-white select-none pointer-events-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-lime,#C8FF57)]/10 text-[var(--accent-lime,#C8FF57)] border border-[var(--accent-lime,#C8FF57)]/30 font-mono text-base font-bold">
                {region.landmark || "✦"}
              </span>
              <div>
                <h3 className="text-sm font-semibold tracking-wide text-zinc-100 font-mono">
                  {region.label}
                </h3>
                <span className="inline-block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Biome: {region.biome}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close Inspector (Esc)"
            >
              <X size={16} />
            </button>
          </div>

          {/* Summary */}
          <p className="text-xs text-zinc-300 leading-relaxed mb-4 font-sans">
            {region.summary}
          </p>

          {/* Core Concepts */}
          <div className="mb-4">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2 block">
              Knowledge Nodes & Concepts
            </span>
            <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
              {region.concepts.map((concept) => {
                const isObj = typeof concept !== "string";
                const label = isObj ? concept.label : concept;
                const desc = isObj ? concept.description : undefined;

                return (
                  <div
                    key={isObj ? concept.id : concept}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-xs font-mono"
                  >
                    <span className="text-zinc-200">{label}</span>
                    {desc && (
                      <span className="text-[10px] text-zinc-500 truncate max-w-[140px]" title={desc}>
                        {desc}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Connected Territories (Roads) */}
          {region.connections && region.connections.length > 0 && (
            <div className="mb-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5 block">
                Connected Territories (Trade & Prerequisite Roads)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {region.connections.map((connId) => (
                  <button
                    key={connId}
                    type="button"
                    onClick={() => onSelectConnectedRegion(connId)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-300 hover:bg-sky-500/20 text-[11px] font-mono transition-colors cursor-pointer"
                  >
                    <Compass size={12} />
                    <span>{connId}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Deep link into City Workspace / Active Quests */}
          {onEnterCity && (
            <button
              type="button"
              onClick={() => {
                onEnterCity(region.label, region.cityId || region.id);
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[var(--accent-lime,#C8FF57)] hover:opacity-90 text-black font-semibold text-xs font-mono tracking-wide transition-all shadow-lg shadow-[var(--accent-lime,#C8FF57)]/15 cursor-pointer"
            >
              <span>Enter Concept Workspace</span>
              <ArrowRight size={14} weight="bold" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
