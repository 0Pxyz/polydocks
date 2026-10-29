import { useState, useMemo, useRef } from "react";
import { Dices, Crosshair, Sparkles } from "lucide-react";
import { ParticleWorldCanvas } from "./ParticleWorldCanvas";
import { ParticleRegionInspector } from "./ParticleRegionInspector";
import { generateParticleWorld } from "./generator";
import { CANONICAL_WORLDS } from "../ascii/worlds";
import type { ParticleRegion, ParticleWorldSpec } from "./types";

export interface ParticleWorldViewProps {
  onEnterCity?: (cityName: string, cityId?: string) => void;
  className?: string;
}

export const PARTICLE_WORLDS_LIST: { id: string; title: string }[] = [
  { id: "neural-networks", title: "Neural Networks" },
  { id: "stoicism", title: "Stoicism" },
  { id: "poker", title: "Poker Strategy" },
];

export function ParticleWorldView({
  onEnterCity,
  className = "",
}: ParticleWorldViewProps) {
  const [activeWorldId, setActiveWorldId] = useState<string>("neural-networks");
  const [customSeed, setCustomSeed] = useState<number | undefined>(undefined);
  const [selectedRegion, setSelectedRegion] = useState<ParticleRegion | null>(null);
  const resetCameraRef = useRef<(() => void) | null>(null);

  const currentWorldSpec: ParticleWorldSpec = useMemo(() => {
    const raw = (CANONICAL_WORLDS[activeWorldId] ||
      CANONICAL_WORLDS["neural-networks"]) as unknown as ParticleWorldSpec;
    return raw;
  }, [activeWorldId]);

  const activeSeed = customSeed !== undefined ? customSeed : currentWorldSpec.seed;

  // Generate procedural particle world deterministically
  const world = useMemo(() => {
    return generateParticleWorld(currentWorldSpec, {
      width: 1400,
      height: 850,
      customSeed: activeSeed,
      particlesPerTerritory: 85,
    });
  }, [currentWorldSpec, activeSeed]);

  // Handle switching to a connected region
  const handleSelectConnected = (regionId: string) => {
    const target = currentWorldSpec.regions.find((r) => r.id === regionId);
    if (target) {
      setSelectedRegion(target);
    }
  };

  // Randomize Seed
  const handleRandomizeSeed = () => {
    const nextSeed = Math.floor(Math.random() * 90000) + 10000;
    setCustomSeed(nextSeed);
  };

  return (
    <div
      className={`relative w-full h-full min-h-screen bg-[#06080e] overflow-hidden select-none ${className}`}
    >
      {/* 1. World Selector Header & Control Bar */}
      <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0d121c]/90 border border-white/10 shadow-2xl backdrop-blur-xl font-mono text-xs text-zinc-300">
          {/* World Selector Tabs */}
          <div className="flex items-center gap-1">
            {PARTICLE_WORLDS_LIST.map((w) => {
              const isActive = w.id === activeWorldId;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setActiveWorldId(w.id);
                    setCustomSeed(undefined);
                    setSelectedRegion(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    isActive
                      ? "bg-[var(--accent-lime,#C8FF57)] text-black font-semibold shadow-md"
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {w.title}
                </button>
              );
            })}
          </div>

          <div className="h-4 w-px bg-white/10 mx-1" />

          {/* Seed Indicator & Randomizer */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-zinc-400">
            <span>Seed:</span>
            <span className="font-semibold text-zinc-200">{activeSeed}</span>
            <button
              type="button"
              onClick={handleRandomizeSeed}
              className="p-1 rounded hover:bg-white/10 text-zinc-300 hover:text-[var(--accent-lime,#C8FF57)] transition-colors cursor-pointer"
              title="Generate new procedural variation (same semantic world)"
            >
              <Dices size={14} />
            </button>
          </div>

          <div className="h-4 w-px bg-white/10 mx-1" />

          {/* Reset Camera Button */}
          <button
            type="button"
            onClick={() => resetCameraRef.current?.()}
            className="p-1 rounded hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Reset camera zoom & position"
          >
            <Crosshair size={14} />
          </button>
        </div>

        {/* Experiment Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono tracking-wider uppercase">
          <Sparkles size={11} />
          <span>Procedural Particle Engine • Prototype</span>
        </div>
      </div>

      {/* 2. Interactive High-Performance Canvas Surface */}
      <ParticleWorldCanvas
        world={world}
        selectedRegionId={selectedRegion?.id}
        onSelectRegion={setSelectedRegion}
        onResetCameraReady={(fn) => {
          resetCameraRef.current = fn;
        }}
        className="w-full h-full"
      />

      {/* 3. Progressive Disclosure Region Inspector Card */}
      <ParticleRegionInspector
        region={selectedRegion}
        worldSpec={currentWorldSpec}
        onClose={() => setSelectedRegion(null)}
        onSelectConnected={handleSelectConnected}
        onEnterCity={onEnterCity}
      />
    </div>
  );
}
