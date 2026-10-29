import { motion } from "motion/react";
import { spring, prefersReducedMotion } from "@/lib/motion";
import { describeRegion } from "@/lib/city/cityModel";
import type { CityWorkspaceData } from "./types";

interface CityOverviewProps {
  data: CityWorkspaceData;
  isFirstVisit?: boolean;
}

/**
 * Immersive city landing: title, one data-built line, nothing else competing
 * with the background. The city's tools live in the dock; first-time
 * visitors get a subtle hint pointing there.
 */
export function CityOverview({ data, isFirstVisit = false }: CityOverviewProps) {
  const isReduced = prefersReducedMotion();

  const description = describeRegion({
    concepts: data.tags,
    sources: data.sources.length,
    notes: data.notes.length,
    quests: data.quests.length,
    doneQuests: data.quests.filter((q) => q.completed).length,
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: isReduced ? 1 : 0.98 }}
      animate={{ opacity: 1, scale: 1, transition: spring.soft }}
      exit={{ opacity: 0, scale: isReduced ? 1 : 0.98, transition: { duration: 0.16 } }}
      className="flex flex-col items-center justify-center text-center w-full max-w-2xl mx-auto px-4 min-h-[50vh] select-none"
    >
      <p className="text-xs text-white/40 font-sans mb-3">{data.region}</p>
      <h1 className="text-4xl sm:text-5xl font-semibold text-white tracking-normal mb-3">
        {data.title}
      </h1>
      <p className="text-sm text-white/60 max-w-md font-sans leading-relaxed">{description}</p>
      {isFirstVisit && (
        <p className="mt-6 text-xs text-white/40 font-sans">
          Pick a tool in the dock — it remembers your last one.
        </p>
      )}
    </motion.div>
  );
}
