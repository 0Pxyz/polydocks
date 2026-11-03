import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import {
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
import { shouldPauseTourOnTakeover } from "@/lib/onboarding/tourTakeover";
import { useThemeStore } from "@/lib/theme";
import { spring, prefersReducedMotion } from "@/lib/motion";

export function LiveOnboarding() {
  const {
    isOpen,
    isPlaying,
    paused,
    setPaused,
    currentStep,
    currentStepIndex,
    nextStep,
    prevStep,
    skipDemo,
    completeDemo,
  } = useOnboardingStore();

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const thoughtTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  // Last tool the tour itself force-focused (null = none yet). Lets the
  // takeover guard below tell tour choreography apart from user switches.
  const forcedToolRef = useRef<string | null>(null);
  const lastSeenRef = useRef<{ wasOpen: boolean; step: string; tool: string | null } | null>(null);
  const activeToolId = useDockStore((s) => s.activeToolId);
  const isReduced = prefersReducedMotion();
  const dockPosition = useThemeStore((s) => s.dockPosition);

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
    const force = (toolId: string) => {
      forcedToolRef.current = toolId || null;
      dock.setActiveTool(toolId);
    };

    switch (currentStep) {
      case "home":
        force("");
        pushThought("Poly is active and ready");
        break;

      case "customize":
        force("settings");
        pushThought("Applying theme tokens across the workspace…");
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

      case "breathe":
        pushThought("Synthesizing box-breathing plugin…");
        thoughtTimersRef.current.push(
          setTimeout(() => {
            pushThought("Mounted box-breathing in dock");
          }, 3000)
        );
        break;

      case "coin":
        pushThought("Synthesizing decision-coin plugin…");
        thoughtTimersRef.current.push(
          setTimeout(() => {
            pushThought("Mounted decision-coin in dock");
          }, 3000)
        );
        break;

      case "focus":
        pushThought("Synthesizing focus-timer plugin…");
        thoughtTimersRef.current.push(
          setTimeout(() => {
            pushThought("Focus timer keeps counting in the background");
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
  // (stops the auto-advance timer and the focus stealing). Resume with the
  // pill play button, dismiss with Skip/Esc. Never fires on the tour's own
  // focus changes — see shouldPauseTourOnTakeover.
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
    }
  }, [isOpen, isPlaying, paused, currentStep, activeToolId]);

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
        setPaused(!paused);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, paused, skipDemo, nextStep, prevStep]);

  if (!isOpen || currentStep === "idle") return null;

  // Position opposite to the dock so it never collides!
  const isDockTop = dockPosition === "top";
  const positionClass = isDockTop
    ? "bottom-8 left-1/2 -translate-x-1/2"
    : "top-8 left-1/2 -translate-x-1/2";

  const yOffset = isReduced ? 0 : isDockTop ? 20 : -20;

  return (
    <div
      className={`fixed ${positionClass} z-50 pointer-events-auto select-none max-w-xl w-[calc(100%-2rem)]`}
      aria-label="Live product demonstration"
    >
      <motion.div
        initial={{ opacity: 0, y: yOffset }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: yOffset }}
        transition={spring.soft}
        className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-[#12151D]/95 border border-white/10 shadow-2xl backdrop-blur-xl w-full justify-between"
      >
        {/* Step Info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-lime)] shrink-0 animate-pulse" />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground truncate">
                {stepDef.title}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                ({currentStepIndex + 1}/{ONBOARDING_STEPS.length})
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
              {stepDef.subtitle}
            </span>
          </div>
        </div>

        {/* Step Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Pause / Play */}
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
            title={paused ? "Resume demo (Space)" : "Pause demo (Space)"}
            aria-label={paused ? "Resume demo" : "Pause demo"}
          >
            {paused ? <Play size={13} weight="fill" /> : <Pause size={13} weight="fill" />}
          </button>

          {/* Prev / Next */}
          <button
            type="button"
            onClick={prevStep}
            disabled={currentStepIndex === 0}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none hover:bg-white/10 transition-colors cursor-pointer"
            title="Previous step (Left Arrow)"
          >
            <ArrowLeft size={13} />
          </button>
          <button
            type="button"
            onClick={nextStep}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
            title="Next step (Right Arrow)"
          >
            <ArrowRight size={13} />
          </button>

          <div className="w-px h-3.5 bg-white/10 mx-0.5" />

          {/* Skip Demo Button */}
          <button
            type="button"
            onClick={skipDemo}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            title="Skip demo and start working (Esc)"
          >
            <span>Skip</span>
            <X size={12} weight="bold" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
