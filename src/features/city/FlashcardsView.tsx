import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowSquareOut } from "@phosphor-icons/react";
import { spring } from "@/lib/motion";
import type { CitySourceItem } from "./types";

export interface FlashcardsViewProps {
  cityName: string;
  sources?: CitySourceItem[];
}

interface Flashcard {
  id: string;
  prompt: string;
  solution: string;
  sourceUrl: string;
  sourceDomain: string;
}

export function FlashcardsView({ cityName, sources = [] }: FlashcardsViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const cards: Flashcard[] =
    sources.length > 0
      ? sources.map((s, idx) => ({
          id: `card-${idx}`,
          prompt: s.title,
          solution: s.why || `Primary source and architectural reference for ${cityName}.`,
          sourceUrl: s.url,
          sourceDomain: s.domain || (s.url.startsWith("http") ? new URL(s.url).hostname : "Primary Source"),
        }))
      : [
          {
            id: "card-default-1",
            prompt: `Core Concept: ${cityName}`,
            solution: `Foundational overview and principles synthesized from primary research.`,
            sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(cityName)}`,
            sourceDomain: "wikipedia.org",
          },
        ];

  const currentCard = cards[currentIndex] || cards[0];

  const handleNext = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % cards.length);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev <= 0 ? cards.length - 1 : prev - 1));
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center pt-8 px-4 select-none">
      {/* Header Info */}
      <div className="w-full flex items-center justify-between mb-4 text-[13px] text-[#9aa5b8]">
        <span>{cityName} Flashcards</span>
        <span>
          {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {/* Flip Card Container */}
      <motion.div
        layout
        transition={spring.soft}
        onClick={() => setIsFlipped((prev) => !prev)}
        className="w-full min-h-[300px] bg-[#0c0e14]/90 backdrop-blur-xl rounded-2xl p-6 sm:p-8 flex flex-col justify-between cursor-pointer shadow-2xl relative transition-colors hover:bg-[#11141c]/90"
      >
        <AnimatePresence mode="wait">
          {!isFlipped ? (
            <motion.div
              key="front"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col justify-center"
            >
              <span className="text-[11px] text-[var(--accent-lime)] font-mono uppercase tracking-wider mb-2">
                Prompt
              </span>
              <h3 className="text-xl sm:text-2xl font-semibold text-white leading-snug">
                {currentCard.prompt}
              </h3>
              <p className="text-[13px] text-[#9aa5b8] mt-4">
                Click to reveal solution
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="back"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col justify-center"
            >
              <span className="text-[11px] text-[var(--accent-lime)] font-mono uppercase tracking-wider mb-2">
                Solution
              </span>
              <p className="text-base sm:text-lg text-[#d1d6e2] leading-relaxed">
                {currentCard.solution}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer with Primary Source Link */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-4 mt-4 flex items-center justify-between text-xs"
        >
          <a
            href={currentCard.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[#9aa5b8] hover:text-[var(--accent-lime)] transition-colors"
          >
            <span>Source: {currentCard.sourceDomain}</span>
            <ArrowSquareOut size={14} />
          </a>
        </div>
      </motion.div>

      {/* Navigation Controls */}
      <div className="flex items-center gap-4 mt-6">
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous card"
          className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#9aa5b8] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => setIsFlipped((prev) => !prev)}
          className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[13px] text-white transition-colors cursor-pointer"
        >
          Flip Card
        </button>
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next card"
          className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#9aa5b8] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
