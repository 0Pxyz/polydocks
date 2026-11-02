import { motion, AnimatePresence } from "motion/react";
import { Play, Pause, ArrowRight, ArrowLeft, X } from "@phosphor-icons/react";
import { useOnboardingStore, ONBOARDING_STEPS } from "@/lib/store/useOnboardingStore";
import { Orb } from "@/features/agent/Orb";
import { ThoughtStream } from "@/features/home/ThoughtStream";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

interface OnboardingPluginViewProps {
  onDismiss?: () => void;
}

/**
 * Cinematic tour stage (the launch-video flow): center orb, live thought
 * line above it, one narration line below. Pure presentation — the tour
 * runtime (auto-advance, dock choreography, takeover pause) lives in the
 * always-mounted engine, so this view survives focus switches and never
 * needs a Next click to keep playing.
 */
export function OnboardingPluginView({ onDismiss }: OnboardingPluginViewProps) {
  const {
    isOpen,
    currentStep,
    currentStepIndex,
    nextStep,
    prevStep,
    skipDemo,
    paused,
    setPaused,
  } = useOnboardingStore();
  const isReduced = prefersReducedMotion();

  if (!isOpen || currentStep === "idle") return null;

  const stepDef = ONBOARDING_STEPS[currentStepIndex] ?? ONBOARDING_STEPS[0];

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
            onClick={() => setPaused(!paused)}
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
