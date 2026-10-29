import { X, ArrowRight } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useCityWorkspace } from "@/features/city/useCityWorkspace";
import { describeRegion } from "@/lib/city/cityModel";
import type { ParticleRegion, ParticleConcept } from "./types";

export interface RegionPopoverAnchor {
  x: number;
  y: number;
}

interface ParticleRegionPopoverProps {
  region: ParticleRegion | null;
  anchor: RegionPopoverAnchor | null;
  onClose: () => void;
  onEnterCity?: (cityName: string, cityId?: string) => void;
}

function conceptLabels(concepts: ParticleRegion["concepts"]): string[] {
  return concepts
    .map((c: string | ParticleConcept) => (typeof c === "string" ? c : c.label))
    .filter((label) => label.trim().length > 0);
}

/**
 * One compact popover per map area: the area name, a single description line
 * built from real workspace data, and one Enter button. Nothing else.
 */
export function ParticleRegionPopover({
  region,
  anchor,
  onClose,
  onEnterCity,
}: ParticleRegionPopoverProps) {
  const open = region !== null && anchor !== null;
  const cityId = region?.cityId || region?.id || "";
  const { data, loading, error } = useCityWorkspace(open ? cityId : "");

  const description = !region
    ? ""
    : loading
      ? ""
      : error
        ? "Couldn't load details."
        : describeRegion({
          concepts: conceptLabels(region.concepts),
          sources: data.sources.length,
          notes: data.notes.length,
          quests: data.quests.length,
          doneQuests: data.quests.filter((q) => q.completed).length,
        });

  const handleEnter = () => {
    if (!region) return;
    onEnterCity?.(region.label, region.cityId || region.id);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <PopoverAnchor asChild>
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: anchor ? Math.min(Math.max(anchor.x, 180), window.innerWidth - 180) : 0,
            top: anchor ? Math.min(Math.max(anchor.y, 140), window.innerHeight - 200) : 0,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </PopoverAnchor>
      {region && (
        <PopoverContent
          side="bottom"
          align="center"
          sideOffset={12}
          className="w-72 p-4 bg-[#0c1017] border-white/10 text-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-tight">{region.label}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-1 min-h-5">
            {loading ? (
              <Skeleton className="h-4 w-full bg-white/5" aria-label="Loading area details" />
            ) : (
              <p className="text-xs text-white/60 leading-relaxed">{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleEnter}
            className="mt-3 w-full py-2 px-3 rounded-xl bg-[var(--accent-lime)] text-black font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Enter {region.label}</span>
            <ArrowRight size={14} />
          </button>
        </PopoverContent>
      )}
    </Popover>
  );
}
