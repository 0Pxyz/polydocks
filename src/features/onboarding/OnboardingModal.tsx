import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  House,
  Sparkle,
  Storefront,
  ArrowRight,
  Check,
  SquaresFour,
} from "@phosphor-icons/react";
import { useOnboardingStore } from "@/lib/store/useOnboardingStore";
import { spring, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

interface OnboardingStep {
  title: string;
  description: string;
  icon: typeof Sparkle;
  actionText: string;
}

const STEPS: OnboardingStep[] = [
  {
    title: "Polydocks",
    description:
      "Your personal agentic workspace. One agent, one dock, and plugins that extend what both can do.",
    icon: House,
    actionText: "Next",
  },
  {
    title: "Ask your agent",
    description:
      "Research, build, write, automate, organize. Press ⌘K anytime — the agent does real work using the tools in your dock.",
    icon: Sparkle,
    actionText: "Next",
  },
  {
    title: "Your dock",
    description:
      "Installed plugins live here as interactive tools. Click one to open it directly in your workspace.",
    icon: SquaresFour,
    actionText: "Next",
  },
  {
    title: "Plugins",
    description:
      "Tools live here as interactive panels. Discover, install, or ask the agent to create new ones.",
    icon: Storefront,
    actionText: "Start working",
  },
];

export function OnboardingModal() {
  const { isOpen, closeOnboarding } = useOnboardingStore();
  const [currentStep, setCurrentStep] = useState(0);
  const isReduced = prefersReducedMotion();

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const StepIcon = step.icon;
  const isLast = currentStep === STEPS.length - 1;

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      closeOnboarding();
      setCurrentStep(0);
    }
  };

  const handleSkip = () => {
    closeOnboarding();
    setCurrentStep(0);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md select-none">
        <motion.div
          initial={{ opacity: 0, scale: isReduced ? 1 : 0.96, y: isReduced ? 0 : 8 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: spring.soft }}
          exit={{ opacity: 0, scale: isReduced ? 1 : 0.96, y: isReduced ? 0 : 8 }}
          className="relative w-full max-w-md rounded-2xl bg-[#0c0e14]/95 p-6 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center border border-white/5"
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
              onClick={handleSkip}
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
