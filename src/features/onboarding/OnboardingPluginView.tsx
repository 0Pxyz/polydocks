import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Play, Pause, ArrowRight, ArrowLeft, X } from "@phosphor-icons/react";
import { useOnboardingStore, ONBOARDING_STEPS } from "@/lib/store/useOnboardingStore";
import { useDockStore } from "@/lib/store/useDockStore";
import { pushThought } from "@/lib/agent/thoughtStream";
import { shouldPauseTourOnTakeover } from "@/lib/onboarding/tourTakeover";
import { Orb } from "@/features/agent/Orb";
import { ThoughtStream } from "@/features/home/ThoughtStream";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

interface OnboardingPluginViewProps {
  onDismiss?: () => void;
}

/**
 * Cinematic tour stage (the launch-video flow): center orb, live thought
 * line above it, one narration line below — auto-advancing, fully
 * explained, no Next button required. The tab is the only tour surface;
 * step pills and the dock keep switching above while the tour plays.
 */
export function OnboardingPluginView({ onDismiss }: OnboardingPluginViewProps) {
  const {
    isOpen,
    isPlaying,
    currentStep,
    currentStepIndex,
    nextStep,
    prevStep,
    skipDemo,
    completeDemo,
  } = useOnboardingStore();

  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thoughtTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  // Last tool the tour itself force-focused (null = none yet). Lets the
  // takeover guard tell tour choreography apart from user switches.
  const forcedToolRef = useRef<string | null>(null);
  const lastSeenRef = useRef<{ wasOpen: boolean; step: string; tool: string | null } | null>(null);
  const activeToolId = useDockStore((s) => s.activeToolId);
  const isReduced = prefersReducedMotion();

  const stepDef = ONBOARDING_STEPS[currentStepIndex] ?? ONBOARDING_STEPS[0];

  // Auto-advance while playing and not paused. Manual Next is never
  // required; the tour explains each tab as it opens it.
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

  // Orchestrate dock tabs + thought narration on step entry.
  useEffect(() => {
    if (!isOpen) return;

    const dock = useDockStore.getState();
    const force = (toolId: string) => {
      forcedToolRef.current = toolId || null;
      dock.setActiveTool(toolId);
    };

    switch (currentStep) {
      case "intro":
        force("");
        pushThought("Poly is active and ready");
        break;

      case "research":
        pushThought("Querying literature via TinyFish: deep work protocols...", {
          tool: "search.web",
        });
        thoughtTimersRef.current.push(
          setTimeout(() => {
            pushThought("Fetched primary source: Sophie Leroy (2009) Attention Residue", {
              tool: "search.fetch",
            });
          }, 2200)
        );
        thoughtTimersRef.current.push(
          setTimeout(() => {
            pushThought("Synthesizing 3 evidence-based techniques into briefing note…");
          }, 5000)
        );
        break;

      case "workspace":
        force("browser");
        pushThought("Opening primary source in native Browser surface", {
          tool: "browser",
        });
        break;

      case "tools":
        force("deep-work-flashcards");
        pushThought("Synthesizing deep-work-flashcards plugin…");
        thoughtTimersRef.current.push(
          setTimeout(() => {
            pushThought("Mounted and pinned deep-work-flashcards in dock");
          }, 3000)
        );
        break;

      case "handoff":
        force("");
        pushThought("Your workspace is ready");
        break;
    }

    // Drop pending thought callbacks on step change/close so no ghost
    // reasoning fires after the user moved on or skipped.
    return () => {
      for (const t of thoughtTimersRef.current) clearTimeout(t);
      thoughtTimersRef.current = [];
    };
  }, [isOpen, currentStep]);

  // User takeover: any manual dock switch while the tour plays pauses it
  // (stops the auto-advance timer and the focus stealing). Resume with
  // play, dismiss with Skip/Esc.
  useEffect(() => {
    const prev = lastSeenRef.current;
    lastSeenRef.current = { wasOpen: isOpen, step: currentStep, tool: activeToolId };
    if (!prev) return;
    if (
      shouldPauseTourOnTakeover({
        wasOpen: prev.wasOpen,
        isPlaying,
        paused,
        stepChanged: prev.step !== currentStep,
        prevTool: prev.tool,
        activeTool: activeToolId,
        forcedTool: forcedToolRef.current,
      })
    ) {
      setPaused(true);
      pushThought("Tour paused — you are driving. Resume from the walkthrough tab.");
    }
  }, [isOpen, isPlaying, paused, currentStep, activeToolId]);

  // Keyboard: Esc skips, arrows navigate, Space toggles pause.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        skipDemo();
      } else if (e.key === "ArrowRight") {
        nextStep();
      } else if (e.key === "ArrowLeft") {
        prevStep();
      } else if (e.key === " ") {
        setPaused((p) => !p);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, skipDemo, nextStep, prevStep]);

  if (!isOpen || currentStep === "idle") return null;

  const orbState =
    currentStep === "research" || currentStep === "tools"
      ? "thinking"
      : currentStep === "intro"
        ? "listening"
        : "idle";

  const handleSkip = () => {
    skipDemo();
    onDismiss?.();
  };

  return (
    <div
      className="flex-1 w-full h-full overflow-y-auto flex flex-col items-center justify-center gap-2 px-6 py-8 font-sans select-none"
      aria-label="Product walkthrough"
    >
      {/* Live thought line */}
      <ThoughtStream className="max-w-md" />

      {/* Orb */}
      <Orb state={orbState} size="md" />

      {/* Narration */}
      <AnimatePresence mode="wait">
        <motion.p
          key={`onboarding-narration-${currentStep}`}
          initial={isReduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={isReduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.28 }}
          className="mt-4 max-w-md px-4 text-center text-sm text-[var(--text-main)] font-medium leading-relaxed"
        >
          “{stepDef.narration}”
        </motion.p>
      </AnimatePresence>

      {/* Slim transport: dots + pause/prev/next + skip. Auto-advance drives;
          nothing here is required. */}
      <div className="mt-6 flex items-center gap-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {ONBOARDING_STEPS.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1 rounded-full transition-all",
                i === currentStepIndex ? "w-5 bg-[var(--accent-lime)]" : "w-1 bg-white/20"
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
            title={paused ? "Resume (Space)" : "Pause (Space)"}
            aria-label={paused ? "Resume walkthrough" : "Pause walkthrough"}
          >
            {paused ? <Play size={13} weight="fill" /> : <Pause size={13} weight="fill" />}
          </button>
          <button
            type="button"
            onClick={prevStep}
            disabled={currentStepIndex === 0}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none hover:bg-white/10 transition-colors cursor-pointer"
            title="Previous step"
            aria-label="Previous step"
          >
            <ArrowLeft size={13} />
          </button>
          <button
            type="button"
            onClick={nextStep}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
            title="Next step"
            aria-label="Next step"
          >
            <ArrowRight size={13} />
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            title="Skip walkthrough (Esc)"
          >
            <span>Skip</span>
            <X size={12} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
