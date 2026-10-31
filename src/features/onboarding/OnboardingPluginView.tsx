import { PlayCircle, Globe, Wrench, Sparkle, ArrowRight, Stop } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useOnboardingStore, ONBOARDING_STEPS } from "@/lib/store/useOnboardingStore";
import { useDockStore } from "@/lib/store/useDockStore";

interface OnboardingPluginViewProps {
  onDismiss?: () => void;
}

export function OnboardingPluginView({ onDismiss }: OnboardingPluginViewProps) {
  const {
    isPlaying,
    currentStep,
    currentStepIndex,
    startDemo,
    nextStep,
    completeDemo,
  } = useOnboardingStore();

  const handleStart = () => {
    startDemo(true);
    const dock = useDockStore.getState();
    // Start with the agent intro
    dock.openTool("agent");
  };

  const handleNext = () => {
    const nextIdx = currentStepIndex + 1;
    if (nextIdx < ONBOARDING_STEPS.length) {
      nextStep();
      const targetStep = ONBOARDING_STEPS[nextIdx];
      const dock = useDockStore.getState();
      if (targetStep.dockTarget) {
        dock.openTool(targetStep.dockTarget);
        dock.focusTool(targetStep.dockTarget);
      }
    } else {
      completeDemo();
    }
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto px-6 py-8 font-sans select-none">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-lime)]/10 text-[var(--accent-lime)] flex items-center justify-center shrink-0">
              <PlayCircle size={24} weight="bold" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground tracking-tight">
                Product Walkthrough
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Autonomous live tour of Poly operating your workspace in real-time
              </p>
            </div>
          </div>

          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="text-muted-foreground hover:text-foreground text-xs h-8 px-2.5"
            >
              Close
            </Button>
          )}
        </div>

        {/* Live Status / Primary Control Card */}
        <div className="p-5 rounded-2xl bg-card border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-medium text-foreground">
              {isPlaying && currentStep !== "idle"
                ? `Active: Step ${currentStepIndex + 1} of ${ONBOARDING_STEPS.length}`
                : "Live Interactive Demonstration"}
            </span>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isPlaying && currentStep !== "idle"
                ? ONBOARDING_STEPS[currentStepIndex]?.title + " — " + ONBOARDING_STEPS[currentStepIndex]?.subtitle
                : "Experience the Agentic Dock in action: autonomous web research, Chromium playback, and on-demand tool synthesis."}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isPlaying && currentStep !== "idle" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={completeDemo}
                  className="h-8 px-3 text-xs gap-1.5"
                >
                  <Stop size={14} />
                  Stop Tour
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleNext}
                  className="h-8 px-3.5 text-xs bg-[var(--accent-lime)] text-black hover:brightness-105 font-medium gap-1.5"
                >
                  <span>Next</span>
                  <ArrowRight size={13} weight="bold" />
                </Button>
              </>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={handleStart}
                className="h-9 px-4 text-xs bg-[var(--accent-lime)] text-black hover:brightness-105 font-medium gap-2"
              >
                <PlayCircle size={16} weight="fill" />
                <span>Start Walkthrough</span>
              </Button>
            )}
          </div>
        </div>

        {/* What You'll Experience (Feature Highlights) */}
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
            What Poly Demonstrates
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-card/60 border border-border/40 flex flex-col gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Globe size={16} weight="bold" />
              </div>
              <span className="text-xs font-medium text-foreground">Autonomous Research</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Queries primary empirical papers via TinyFish and renders them in remote Chromium.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-card/60 border border-border/40 flex flex-col gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Wrench size={16} weight="bold" />
              </div>
              <span className="text-xs font-medium text-foreground">Live Tool Synthesis</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Builds and pins sandboxed React tools on the fly directly to your dock.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-card/60 border border-border/40 flex flex-col gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Sparkle size={16} weight="bold" />
              </div>
              <span className="text-xs font-medium text-foreground">The Agentic Dock</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Zero modals, zero clutter. One persistent control surface for all tools.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
