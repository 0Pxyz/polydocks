import { useState } from "react";
import { motion } from "motion/react";
import {
  NotePencil,
  Globe,
  Cards,
  PaperPlaneRight,
} from "@phosphor-icons/react";
import { Orb } from "@/features/agent/Orb";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { spring, prefersReducedMotion } from "@/lib/motion";
import type { CityWorkspaceData } from "./types";

interface CityOverviewProps {
  data: CityWorkspaceData;
  onSelectTool: (toolId: string) => void;
  onSynthesizeTool?: (toolId: string) => void;
  onBackToWorld?: () => void;
}

export function CityOverview({
  data,
  onSelectTool,
  onSynthesizeTool,
}: CityOverviewProps) {
  const [quickPrompt, setQuickPrompt] = useState("");
  const { sendMessage, setLayoutState, toggleAgent, orbState } = useConversationStore();
  const isReduced = prefersReducedMotion();

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = quickPrompt.trim();
    if (!prompt) return;

    setQuickPrompt("");
    setLayoutState("sheet");
    await sendMessage(prompt, data.cityId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: isReduced ? 1 : 0.98 }}
      animate={{ opacity: 1, scale: 1, transition: spring.soft }}
      exit={{ opacity: 0, scale: isReduced ? 1 : 0.98, transition: { duration: 0.16 } }}
      className="flex flex-col items-center justify-between w-full max-w-3xl mx-auto min-h-[calc(100vh-var(--dock-bottom,88px)-64px)] px-4 py-8"
    >
      {/* Central Concept Focus */}
      <div className="flex-1 flex flex-col items-center justify-center text-center my-6 w-full">
        <h1 className="text-3xl sm:text-5xl font-semibold text-white mb-2">
          {data.title}
        </h1>
        <p className="text-sm text-[#9aa5b8] max-w-md mb-8">
          {data.region} • Workspace curated by the dock agent
        </p>

        {/* Central Agent Orb */}
        <div
          onClick={() => toggleAgent(data.cityId)}
          className="cursor-pointer transition-transform hover:scale-105 active:scale-95 my-4"
          title="Talk to Agent (⌘K)"
        >
          <Orb state={orbState} size="lg" />
        </div>

        {/* Core Tool Links */}
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            type="button"
            onClick={() => onSelectTool("browser")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-sans text-[#d1d6e2] hover:text-white transition-colors cursor-pointer"
          >
            <Globe size={16} />
            <span>Research ({data.sources.length})</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool("notes")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-sans text-[#d1d6e2] hover:text-white transition-colors cursor-pointer"
          >
            <NotePencil size={16} />
            <span>Notes ({data.notes.length})</span>
          </button>
        </div>

        {/* Dynamic Tool Synthesis Showcase */}
        <div className="mt-8 p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-lg w-full text-left">
          <div>
            <div className="text-xs font-medium text-white">Synthesize dynamic tools</div>
            <div className="text-[11px] text-[#9aa5b8] mt-0.5">
              The agent expands the dock on demand with custom interactive tools.
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onSynthesizeTool) {
                onSynthesizeTool("flashcards");
              } else {
                onSelectTool("flashcards");
              }
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--accent-lime)] text-black font-semibold text-xs transition-opacity hover:opacity-90 cursor-pointer shrink-0"
          >
            <Cards size={16} weight="bold" />
            <span>Synthesize Flashcards</span>
          </button>
        </div>
      </div>

      {/* Floating Prompt Bar */}
      <div className="w-full max-w-xl pb-2">
        <form
          onSubmit={handleQuickSubmit}
          className="relative flex items-center gap-2 rounded-2xl bg-[#12161f]/95 border border-white/10 px-4 py-2.5 shadow-2xl backdrop-blur-xl focus-within:border-[var(--accent-lime)]/40 transition-colors"
        >
          <input
            type="text"
            value={quickPrompt}
            onChange={(e) => setQuickPrompt(e.target.value)}
            placeholder={`Ask Agent about ${data.title}… (⌘K)`}
            className="flex-1 bg-transparent text-sm text-[#f1f3f9] placeholder:text-muted-foreground/60 focus:outline-none font-sans"
          />

          <button
            type="submit"
            disabled={!quickPrompt.trim()}
            className="p-1.5 rounded-lg text-white hover:text-[var(--accent-lime)] disabled:opacity-30 transition-colors cursor-pointer"
            title="Send prompt"
          >
            <PaperPlaneRight size={16} weight="fill" />
          </button>
        </form>
      </div>
    </motion.div>
  );
}
