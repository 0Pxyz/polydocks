import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Compass, Sparkle, ArrowRight, Check } from "@phosphor-icons/react";
import { spring, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

const ONBOARDING_STORAGE_KEY = "polymax_onboarding_seen_v1";

interface OnboardingModalProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

interface OnboardingStep {
  title: string;
  description: string;
  icon: typeof Sparkle;
  actionText: string;
}

const STEPS: OnboardingStep[] = [
  {
    title: "Master any domain",
    description:
      "Tell your agent what you want to master. It constructs a living world map where knowledge regions and concepts become interactive cities.",
    icon: Compass,
    actionText: "Next",
  },
  {
    title: "The Agentic Dock",
    description:
      "No window sprawl or chat bubble feeds. The dock is your persistent control surface pinned to the screen. Every tool opens directly into the active viewport.",
    icon: Sparkle,
    actionText: "Next",
  },
  {
    title: "Synthesize on demand",
    description:
      "Your dock agent orchestrates research and builds new tools dynamically. Hit + anytime to generate flashcards, comparators, or custom micro-apps.",
    icon: Sparkle,
    actionText: "Start Exploring",
  },
];

export function OnboardingModal({ forceOpen = false, onClose }: OnboardingModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const isReduced = prefersReducedMotion();

  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true);
      setCurrentStep(0);
      return;
    }
    const hasSeen = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!hasSeen) {
      setIsOpen(true);
    }
  }, [forceOpen]);

  const handleDismiss = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    setIsOpen(false);
    onClose?.();
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleDismiss();
    }
  };

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const StepIcon = step.icon;
  const isLast = currentStep === STEPS.length - 1;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md select-none">
        <motion.div
          initial={{ opacity: 0, scale: isReduced ? 1 : 0.96, y: isReduced ? 0 : 8 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: spring.soft }}
          exit={{ opacity: 0, scale: isReduced ? 1 : 0.96, y: isReduced ? 0 : 8 }}
          className="relative w-full max-w-md rounded-2xl bg-[#0c0e14]/95 p-6 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center"
        >
          {/* Step Icon */}
          <div className="w-12 h-12 rounded-2xl bg-white/[0.05] flex items-center justify-center text-[var(--accent-lime)] mb-5">
            <StepIcon size={24} weight="duotone" />
          </div>

          {/* Title & Description */}
          <h2 className="text-xl font-semibold text-white mb-2 tracking-normal">
            {step.title}
          </h2>
          <p className="text-sm text-[#9aa5b8] font-sans leading-relaxed mb-6">
            {step.description}
          </p>

          {/* Stepper Dots */}
          <div className="flex items-center gap-1.5 mb-6">
            {STEPS.map((_, idx) => (
              <span
                key={idx}
                className={cn(
                  "w-2 h-2 rounded-full transition-all duration-200",
                  idx === currentStep
                    ? "bg-[var(--accent-lime)] w-5"
                    : "bg-white/20"
                )}
              />
            ))}
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs text-[#9aa5b8] hover:text-white transition-colors cursor-pointer px-2 py-1"
            >
              Skip
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-lime)] text-black font-semibold text-xs transition-opacity hover:opacity-90 cursor-pointer"
            >
              <span>{step.actionText}</span>
              {isLast ? <Check size={14} weight="bold" /> : <ArrowRight size={14} />}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
