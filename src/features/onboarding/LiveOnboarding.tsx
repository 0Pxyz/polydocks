import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkle,
  Globe,
  SquaresFour,
  Wrench,
  Check,
  X,
  Play,
  Pause,
  ArrowRight,
  ArrowLeft,
} from "@phosphor-icons/react";
import {
  useOnboardingStore,
  ONBOARDING_STEPS,
} from "@/lib/store/useOnboardingStore";
import { pushThought } from "@/lib/agent/thoughtStream";
import { useDockStore } from "@/lib/store/useDockStore";
import { spring, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

export function LiveOnboarding() {
  const {
    isOpen,
    isPlaying,
    currentStep,
    currentStepIndex,
    setStep,
    nextStep,
    prevStep,
    skipDemo,
    completeDemo,
  } = useOnboardingStore();

  const [paused, setPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isReduced = prefersReducedMotion();

  const stepDef = ONBOARDING_STEPS[currentStepIndex] ?? ONBOARDING_STEPS[0];

  // Auto-advance timer when playing and not paused
  useEffect(() => {
    if (!isOpen || paused || !isPlaying) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      if (currentStepIndex < ONBOARDING_STEPS.length - 1) {
        nextStep();
      } else {
        completeDemo();
      }
    }, stepDef.durationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen, paused, isPlaying, currentStepIndex, stepDef.durationMs, nextStep, completeDemo]);

  // Orchestrate dock and thought stream on step entry
  useEffect(() => {
    if (!isOpen) return;

    const dock = useDockStore.getState();

    switch (currentStep) {
      case "intro":
        dock.setActiveTool("");
        pushThought("Poly is active and ready");
        break;

      case "research":
        pushThought("Querying literature via TinyFish: deep work protocols...", {
          tool: "search.web",
        });
        setTimeout(() => {
          pushThought("Reading primary sources via TinyFish…", {
            tool: "search.fetch",
          });
        }, 2200);
        setTimeout(() => {
          pushThought("Synthesizing 3 evidence-based techniques into briefing note…");
        }, 5000);
        break;

      case "workspace":
        dock.setActiveTool("browser");
        pushThought("Opening primary source in native Browser surface", {
          tool: "browser",
        });
        break;

      case "tools":
        dock.setActiveTool("deep-work-flashcards");
        pushThought("Synthesizing deep-work-flashcards plugin…");
        setTimeout(() => {
          pushThought("Mounted and pinned deep-work-flashcards in dock");
        }, 3000);
        break;

      case "handoff":
        dock.setActiveTool("");
        pushThought("Your workspace is ready");
        break;
    }
  }, [isOpen, currentStep]);

  // Keyboard navigation: Esc to skip, arrows to navigate, Space to toggle pause
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skipDemo();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextStep();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevStep();
      } else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, skipDemo, nextStep, prevStep]);

  if (!isOpen) return null;

  const stepIcons = [Sparkle, Globe, SquaresFour, Wrench, Check];

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 pointer-events-none flex flex-col items-center select-none pt-4 px-4"
      aria-label="Live product demonstration"
    >
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={spring.soft}
        className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-full bg-[#12151D]/90 border border-white/10 shadow-2xl backdrop-blur-xl max-w-2xl w-full justify-between"
      >
        {/* Step Indicators */}
        <div className="flex items-center gap-1 sm:gap-2">
          {ONBOARDING_STEPS.map((step, idx) => {
            const Icon = stepIcons[idx] ?? Sparkle;
            const isActive = idx === currentStepIndex;
            const isCompleted = idx < currentStepIndex;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setStep(step.id)}
                title={step.title}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-sans transition-all duration-200 cursor-pointer",
                  isActive
                    ? "bg-[var(--accent-lime)] text-black font-medium shadow-sm"
                    : isCompleted
                    ? "bg-white/10 text-[var(--text-main)] hover:bg-white/15"
                    : "text-[var(--text-muted)] hover:text-white"
                )}
              >
                <Icon size={13} weight={isActive ? "bold" : "regular"} />
                <span className="hidden md:inline">{step.title.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Step Narration & Controls */}
        <div className="flex items-center gap-2">
          {/* Pause / Play */}
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="p-1.5 rounded-full text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title={paused ? "Resume demo (Space)" : "Pause demo (Space)"}
            aria-label={paused ? "Resume demo" : "Pause demo"}
          >
            {paused ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
          </button>

          {/* Prev / Next */}
          <button
            type="button"
            onClick={prevStep}
            disabled={currentStepIndex === 0}
            className="p-1.5 rounded-full text-[var(--text-muted)] hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-white/10 transition-colors cursor-pointer"
            title="Previous step (Left Arrow)"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            onClick={nextStep}
            className="p-1.5 rounded-full text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Next step (Right Arrow)"
          >
            <ArrowRight size={14} />
          </button>

          <div className="w-px h-3.5 bg-white/10 mx-0.5" />

          {/* Skip Demo Button */}
          <button
            type="button"
            onClick={skipDemo}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-white px-2 py-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            title="Skip demo and start working (Esc)"
          >
            <span>Skip</span>
            <X size={12} />
          </button>
        </div>
      </motion.div>

      {/* Cinematic Banner: Subtitle below the stepper */}
      <AnimatePresence mode="wait">
        <motion.div
          key={stepDef.id}
          initial={isReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={isReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="mt-3 text-center px-4 max-w-lg"
        >
          <p className="text-xs sm:text-sm text-[var(--text-muted)] font-sans leading-relaxed">
            <span className="text-[var(--text-main)] font-medium mr-1.5">
              {stepDef.title}:
            </span>
            {stepDef.subtitle}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
