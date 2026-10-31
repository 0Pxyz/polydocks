import { Button } from "@/components/ui/button";
import { useOnboardingStore, ONBOARDING_STEPS } from "@/lib/store/useOnboardingStore";
import { useDockStore } from "@/lib/store/useDockStore";
import { useThemeStore } from "@/lib/theme";
import { motion, AnimatePresence } from "motion/react";
import { spring, prefersReducedMotion } from "@/lib/motion";
import { X, ArrowRight } from "@phosphor-icons/react";

export function LiveOnboardingOverlay() {
  const {
    isOpen,
    currentStep,
    currentStepIndex,
    setStep,
    completeDemo,
  } = useOnboardingStore();
  const dockPosition = useThemeStore((s) => s.dockPosition);
  const isReduced = prefersReducedMotion();

  if (!isOpen || currentStep === "idle") return null;

  const stepDef = ONBOARDING_STEPS[currentStepIndex] ?? ONBOARDING_STEPS[0];

  const handleNext = () => {
    const nextIdx = currentStepIndex + 1;
    if (nextIdx < ONBOARDING_STEPS.length) {
      const targetStep = ONBOARDING_STEPS[nextIdx];
      setStep(targetStep.id);
      const dock = useDockStore.getState();
      if (targetStep.dockTarget) {
        dock.openTool(targetStep.dockTarget);
        dock.focusTool(targetStep.dockTarget);
      }
    } else {
      completeDemo();
    }
  };

  // If dock is on top, place overlay at bottom; if dock is at bottom, place overlay at top.
  // Never collides with or overlaps the dock!
  const positionClass =
    dockPosition === "top"
      ? "bottom-8 left-1/2 -translate-x-1/2"
      : "top-8 left-1/2 -translate-x-1/2";

  const yOffset = isReduced ? 0 : dockPosition === "top" ? 20 : -20;

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, y: yOffset }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: yOffset }}
        transition={spring.soft}
        aria-label="Walkthrough controls"
        className={`fixed ${positionClass} z-50 pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-full bg-card/95 border border-border/60 shadow-2xl backdrop-blur-xl max-w-md w-[calc(100%-2rem)] justify-between select-none`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-lime)] shrink-0 animate-pulse" />
          <span className="text-xs font-medium text-foreground truncate">
            {stepDef.title}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="default"
            size="sm"
            onClick={handleNext}
            className="h-7 px-3 text-xs bg-[var(--accent-lime)] text-black hover:brightness-105 font-medium flex items-center gap-1 cursor-pointer"
          >
            <span>{currentStepIndex < ONBOARDING_STEPS.length - 1 ? "Next" : "Finish"}</span>
            <ArrowRight size={12} weight="bold" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={completeDemo}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-full flex items-center justify-center cursor-pointer"
            title="Skip walkthrough"
          >
            <X size={13} weight="bold" />
          </Button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
