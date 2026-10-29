import { useState } from "react";
import { motion } from "motion/react";
import { spring, prefersReducedMotion } from "@/lib/motion";
import { describeRegion } from "@/lib/city/cityModel";
import { useProfileStore } from "@/lib/store/useProfileStore";
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
  const level = useProfileStore((s) => s.level);
  const xp = useProfileStore((s) => s.xp);
  const streak = useProfileStore((s) => s.streak);
  const [shareState, setShareState] = useState<"idle" | "painting" | "error">("idle");

  const description = describeRegion({
    concepts: data.tags,
    sources: data.sources.length,
    notes: data.notes.length,
    quests: data.quests.length,
    doneQuests: data.quests.filter((q) => q.completed).length,
  });

  const downloadShareCard = async () => {
    if (shareState === "painting") return;
    setShareState("painting");
    try {
      const res = await fetch("/api/share-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: data.title, region: data.region, level, xp, streak }),
      });
      const json = (await res.json().catch(() => null)) as any;
      const url = json?.success ? json.data?.url : null;
      if (!url) {
        setShareState("error");
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = `polymax-${data.cityId}-share.webp`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setShareState("idle");
    } catch {
      setShareState("error");
    }
  };

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
      <button
        type="button"
        onClick={() => void downloadShareCard()}
        disabled={shareState === "painting"}
        className="mt-5 text-xs font-sans text-muted-foreground hover:text-white transition-colors disabled:opacity-50 cursor-pointer bg-transparent border-0 p-0"
      >
        {shareState === "painting"
          ? "Painting share card…"
          : shareState === "error"
            ? "Share card failed — try again"
            : "Download share card"}
      </button>
      {isFirstVisit && (
        <p className="mt-6 text-xs text-white/40 font-sans">
          Pick a tool in the dock — it remembers your last one.
        </p>
      )}
    </motion.div>
  );
}
