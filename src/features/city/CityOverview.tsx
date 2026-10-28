import { motion } from "motion/react";
import {
  NotePencil,
  Globe,
  Cards,
  Folder,
  Target,
  TerminalWindow,
  ArrowLeft,
} from "@phosphor-icons/react";
import { spring, prefersReducedMotion } from "@/lib/motion";
import type { CityWorkspaceData } from "./types";

interface CityOverviewProps {
  data: CityWorkspaceData;
  onSelectTool: (toolId: string) => void;
  onSynthesizeTool?: (toolId: string) => void;
  onBackToWorld?: () => void;
}

/**
 * City Overview: Knowledge Sanctuary & Capability Launchpad
 * Displays the core knowledge pillars of this territory and allows
 * instant jumping to research sources, notes, files, and dynamic tools.
 */
export function CityOverview({
  data,
  onSelectTool,
  onBackToWorld,
}: CityOverviewProps) {
  const isReduced = prefersReducedMotion();

  const capabilities = [
    {
      id: "browser",
      title: "Research & Sources",
      description: `${data.sources.length} primary sources, tutorials, and academic papers.`,
      count: data.sources.length,
      icon: Globe,
    },
    {
      id: "notes",
      title: "Synthesized Notes",
      description: `${data.notes.length} curated notes and key concept summaries.`,
      count: data.notes.length,
      icon: NotePencil,
    },
    {
      id: "files",
      title: "Workspace Files",
      description: "Local markdown files and assets saved in this city.",
      count: data.notes.length,
      icon: Folder,
    },
    {
      id: "quests",
      title: "Mastery Quests",
      description: `${data.quests.length} challenges to verify domain understanding.`,
      count: data.quests.length,
      icon: Target,
    },
    {
      id: "flashcards",
      title: "Interactive Flashcards",
      description: "Spaced-repetition deck synthesized from city sources.",
      count: data.sources.length > 0 ? "Ready" : "Synthesize",
      icon: Cards,
    },
    {
      id: "terminal",
      title: "City Terminal",
      description: "Inspection surface and system logs for this workspace.",
      count: "Shell",
      icon: TerminalWindow,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: isReduced ? 1 : 0.98 }}
      animate={{ opacity: 1, scale: 1, transition: spring.soft }}
      exit={{ opacity: 0, scale: isReduced ? 1 : 0.98, transition: { duration: 0.16 } }}
      className="flex flex-col items-center justify-start w-full max-w-4xl mx-auto min-h-[calc(100vh-var(--dock-bottom,88px)-64px)] px-4 py-8 select-none"
    >
      {/* Top Breadcrumb & Territory Header */}
      <div className="w-full flex items-center justify-between mb-8">
        {onBackToWorld ? (
          <button
            type="button"
            onClick={onBackToWorld}
            className="flex items-center gap-1.5 text-xs text-[#9aa5b8] hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>World Map</span>
          </button>
        ) : (
          <div />
        )}

        <span className="text-xs text-[#9aa5b8] font-sans">
          {data.region}
        </span>
      </div>

      {/* Central Knowledge Domain Title */}
      <div className="flex flex-col items-center text-center mb-10">
        <h1 className="text-4xl sm:text-5xl font-semibold text-white tracking-normal mb-2">
          {data.title}
        </h1>
        <p className="text-sm text-[#9aa5b8] max-w-md font-sans">
          Knowledge territory curated by your agent. Open any tool to explore and master this city.
        </p>
      </div>

      {/* Knowledge Capabilities Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full">
        {capabilities.map((cap) => {
          const Icon = cap.icon;
          return (
            <button
              key={cap.id}
              type="button"
              onClick={() => onSelectTool(cap.id)}
              className="group relative flex flex-col items-start p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] transition-all duration-150 cursor-pointer text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-lime)]"
            >
              <div className="w-9 h-9 rounded-xl bg-white/[0.05] group-hover:bg-[var(--accent-lime)]/15 text-[#d1d6e2] group-hover:text-[var(--accent-lime)] flex items-center justify-center transition-colors mb-3">
                <Icon size={18} />
              </div>

              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-sm font-medium text-white group-hover:text-[var(--accent-lime)] transition-colors">
                  {cap.title}
                </span>
                <span className="text-[11px] font-mono text-[#9aa5b8]">
                  {cap.count}
                </span>
              </div>

              <p className="text-xs text-[#9aa5b8] leading-relaxed font-sans line-clamp-2">
                {cap.description}
              </p>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
