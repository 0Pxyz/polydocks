import { useOnboardingStore } from "@/lib/store/useOnboardingStore";
import { motion, AnimatePresence } from "motion/react";
import { spring, prefersReducedMotion } from "@/lib/motion";
import { X } from "@phosphor-icons/react";

export function LiveOnboardingOverlay() {
  const { isOpen, currentStep, completeDemo } = useOnboardingStore();
  const isReduced = prefersReducedMotion();

  if (!isOpen || currentStep === "idle") return null;

  return (
    <AnimatePresence>
      <motion.button
        initial={{ opacity: 0, scale: isReduced ? 1 : 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: isReduced ? 1 : 0.9 }}
        transition={spring.soft}
        onClick={completeDemo}
        className="fixed top-5 right-5 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/80 hover:bg-card text-muted-foreground hover:text-foreground border border-border/40 shadow-lg backdrop-blur-md text-xs font-medium transition-colors select-none cursor-pointer"
        title="Skip Onboarding Demo"
        aria-label="Skip Onboarding Demo"
      >
        <span>Skip demo</span>
        <X size={12} weight="bold" />
      </motion.button>
    </AnimatePresence>
  );
}
