import { useState, useMemo } from "react";
import { DiceFive, Sparkle } from "@phosphor-icons/react";
import { AsciiWorldCanvas } from "./AsciiWorldCanvas";
import { AsciiRegionInspector } from "./AsciiRegionInspector";
import { generateAsciiWorld } from "./generator";
import { CANONICAL_WORLDS, listAsciiWorlds } from "./worlds";
import type { AsciiRegion, AsciiWorldSpec } from "./types";

export interface AsciiWorldViewProps {
  onEnterCity?: (cityName: string, cityId?: string) => void;
  className?: string;
}

export function AsciiWorldView({
  onEnterCity,
  className = "",
}: AsciiWorldViewProps) {
  const [activeWorldId, setActiveWorldId] = useState<string>("neural-networks");
  const [customSeed, setCustomSeed] = useState<number | undefined>(undefined);
  const [selectedRegion, setSelectedRegion] = useState<AsciiRegion | null>(null);

  const availableWorlds = useMemo(() => listAsciiWorlds(), []);
  const currentWorldSpec: AsciiWorldSpec = useMemo(() => {
    return CANONICAL_WORLDS[activeWorldId] || CANONICAL_WORLDS["neural-networks"];
  }, [activeWorldId]);

  const activeSeed = customSeed !== undefined ? customSeed : currentWorldSpec.seed;

  // Generate ASCII grid deterministically
  const grid = useMemo(() => {
    return generateAsciiWorld(currentWorldSpec, {
      width: 140,
      height: 70,
      customSeed: activeSeed,
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
    <div className={`relative w-full h-full min-h-screen bg-[#06080e] overflow-hidden select-none ${className}`}>
      {/* 1. Monospace World Header & Experiment Switcher Pill */}
      <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0d121c]/90 border border-white/10 shadow-2xl backdrop-blur-xl font-mono text-xs text-zinc-300">
          {/* World Selector Tabs */}
          <div className="flex items-center gap-1">
            {availableWorlds.map((world) => {
              const isActive = world.id === activeWorldId;
              return (
                <button
                  key={world.id}
                  type="button"
                  onClick={() => {
                    setActiveWorldId(world.id);
                    setCustomSeed(undefined);
                    setSelectedRegion(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    isActive
                      ? "bg-[var(--accent-lime,#C8FF57)] text-black font-semibold shadow-md"
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {world.title}
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
              <DiceFive size={14} />
            </button>
          </div>
        </div>

        {/* Experiment Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono tracking-wider uppercase">
          <Sparkle size={10} />
          <span>Procedural ASCII Engine · Hardware Canvas</span>
        </div>
      </div>

      {/* 2. Interactive Canvas Grid */}
      <AsciiWorldCanvas
        grid={grid}
        selectedRegionId={selectedRegion?.id}
        onSelectRegion={(region) => setSelectedRegion(region)}
        className="w-full h-full"
      />

      {/* 3. Floating Region Inspector */}
      <AsciiRegionInspector
        region={selectedRegion}
        onClose={() => setSelectedRegion(null)}
        onSelectConnectedRegion={handleSelectConnected}
        onEnterCity={onEnterCity}
      />
    </div>
  );
}
