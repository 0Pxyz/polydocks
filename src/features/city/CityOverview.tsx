import { useState } from "react";
import { motion } from "motion/react";
import {
  Sparkle,
  Globe,
  NotePencil,
  Target,
  Folder,
  TerminalWindow,
  Flame,
  PaperPlaneRight,
  ArrowLeft,
} from "@phosphor-icons/react";
import { Orb } from "@/features/agent/Orb";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { spring, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";
import type { CityWorkspaceData } from "./types";

interface CityOverviewProps {
  data: CityWorkspaceData;
  onSelectTool: (toolId: string) => void;
  onBackToWorld?: () => void;
}

export function CityOverview({ data, onSelectTool, onBackToWorld }: CityOverviewProps) {
  const [quickPrompt, setQuickPrompt] = useState("");
  const { sendMessage, setLayoutState, toggleAgent, orbState } = useConversationStore();
  const isReduced = prefersReducedMotion();

  const completedQuests = data.quests.filter((q) => q.completed).length;
  const totalQuests = data.quests.length;
  const masteryPercent = totalQuests > 0 ? Math.round((completedQuests / totalQuests) * 100) : 0;

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = quickPrompt.trim();
    if (!prompt) return;

    setQuickPrompt("");
    setLayoutState("sheet");
    await sendMessage(prompt, data.cityId);
  };

  const satelliteTools = [
    {
      id: "notes",
      label: "Notes",
      count: data.notes.length,
      icon: NotePencil,
      color: "text-emerald-400",
    },
    {
      id: "sources",
      label: "Sources",
      count: data.sources.length,
      icon: Globe,
      color: "text-cyan-400",
    },
    {
      id: "quests",
      label: "Quests",
      count: `${completedQuests}/${totalQuests}`,
      icon: Target,
      color: "text-amber-400",
    },
    {
      id: "files",
      label: "Files",
      count: data.notes.length + data.sources.length,
      icon: Folder,
      color: "text-blue-400",
    },
    {
      id: "terminal",
      label: "Terminal",
      icon: TerminalWindow,
      color: "text-[var(--accent-lime)]",
    },
    ...data.dynamicTabs.map((t) => ({
      id: t.id,
      label: t.title,
      icon: Sparkle,
      color: "text-purple-400",
    })),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: isReduced ? 1 : 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: spring.soft }}
      exit={{ opacity: 0, scale: isReduced ? 1 : 0.98, transition: { duration: 0.16 } }}
      className="flex flex-col items-center justify-between w-full max-w-4xl mx-auto min-h-[calc(100vh-var(--dock-bottom,88px)-64px)] px-4 py-2"
    >
      {/* 1. Top Minimalist Gamified Bar */}
      <div className="flex items-center justify-between w-full pb-4 border-b border-white/5">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2">
          {onBackToWorld && (
            <button
              type="button"
              onClick={onBackToWorld}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-xs font-mono text-[#9aa5b8] hover:text-white transition-all cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>World Map</span>
            </button>
          )}

          <span className="text-white/20 text-xs">/</span>

          <span className="text-xs font-mono text-[#9aa5b8]">
            {data.region}
          </span>
        </div>

        {/* Gamified Badges */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--accent-lime)]/30 bg-[var(--accent-lime)]/[0.06] text-xs font-mono text-[var(--accent-lime)]">
            <span className="text-[11px]">✦</span>
            <span>Lvl {data.level}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] text-xs font-mono text-amber-400">
            <Flame size={14} weight="duotone" className="text-amber-500" />
            <span>{completedQuests}/{totalQuests} Quests</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-mono text-[#d1d6e2]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-lime)] animate-ping" />
            <span>{masteryPercent}% Mastery</span>
          </div>
        </div>
      </div>

      {/* 2. Central Living Concept Core Focus */}
      <div className="flex-1 flex flex-col items-center justify-center text-center my-6 sm:my-10 w-full">
        {/* Topic Title */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-xs font-mono text-[#9aa5b8]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-lime)]" />
            <span>{data.region} · Node</span>
          </div>

          <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
            {data.title}
          </h1>
        </div>

        {/* Living Node Orb */}
        <div className="relative my-4 flex items-center justify-center">
          {/* Ambient Orbital Rings */}
          <div className="pointer-events-none absolute w-48 h-48 sm:w-64 sm:h-64 rounded-full border border-white/[0.05] animate-[spin_40s_linear_infinite]" />
          <div className="pointer-events-none absolute w-60 h-60 sm:w-80 sm:h-80 rounded-full border border-dashed border-white/[0.03] animate-[spin_60s_linear_infinite_reverse]" />
          
          <div
            onClick={() => toggleAgent(data.cityId)}
            className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
            title="Interact with City Agent"
          >
            <Orb state={orbState} size="lg" className="drop-shadow-[0_0_35px_rgba(200,255,87,0.25)]" />
          </div>
        </div>

        {/* Satellite Quick-Jump Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-8 max-w-xl">
          {satelliteTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onSelectTool(tool.id)}
                className="group flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 bg-[#121620]/90 hover:bg-white/[0.08] hover:border-[var(--accent-lime)]/40 hover:scale-105 hover:shadow-[0_0_16px_rgba(200,255,87,0.15)] text-xs font-mono text-[#d1d6e2] hover:text-white transition-all cursor-pointer backdrop-blur-md"
              >
                <Icon size={16} weight="duotone" className={cn(tool.color, "transition-transform group-hover:scale-110")} />
                <span className="font-medium">{tool.label}</span>
                {tool.count !== undefined && (
                  <span className="px-1.5 py-0.2 rounded bg-white/10 text-[11px] text-[#9aa5b8] group-hover:text-white">
                    {tool.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Floating Bottom Action / Command Bar */}
      <div className="w-full max-w-[640px] pt-4 pb-2">
        <form
          onSubmit={handleQuickSubmit}
          className="relative flex items-center gap-2 rounded-[22px] bg-[#12161f]/95 border border-white/10 px-3.5 py-2 shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all duration-150 focus-within:border-[var(--accent-lime)]/40 focus-within:shadow-[0_0_24px_rgba(200,255,87,0.15)]"
        >
          <button
            type="button"
            onClick={() => toggleAgent(data.cityId)}
            className="p-1 rounded-full text-[var(--accent-lime)] hover:bg-white/10 transition-colors cursor-pointer"
            title="Open City Agent (⌘K)"
          >
            <Sparkle size={18} weight="duotone" />
          </button>

          <input
            type="text"
            value={quickPrompt}
            onChange={(e) => setQuickPrompt(e.target.value)}
            placeholder={`Ask City Agent about ${data.title}… (⌘K)`}
            className="flex-1 bg-transparent text-sm text-[#f1f3f9] placeholder:text-muted-foreground/60 focus:outline-none font-sans"
          />

          <button
            type="submit"
            disabled={!quickPrompt.trim()}
            className={cn(
              "p-1.5 rounded-full transition-all cursor-pointer",
              quickPrompt.trim()
                ? "bg-[var(--accent-lime)] text-black hover:scale-105"
                : "text-muted-foreground/40 hover:text-muted-foreground"
            )}
            title="Send prompt"
          >
            <PaperPlaneRight size={16} weight="fill" />
          </button>
        </form>
      </div>
    </motion.div>
  );
}
