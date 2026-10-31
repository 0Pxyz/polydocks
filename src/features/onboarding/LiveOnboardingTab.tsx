import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOnboardingStore, ONBOARDING_STEPS, OnboardingStep } from "@/lib/store/useOnboardingStore";
import { useDockStore } from "@/lib/store/useDockStore";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { pushThought } from "@/lib/agent/thoughtStream";

interface LiveOnboardingTabProps {
  onDismiss?: () => void;
}

export function LiveOnboardingTab({ onDismiss }: LiveOnboardingTabProps) {
  const {
    currentStep,
    currentStepIndex,
    setStep,
    nextStep,
    prevStep,
    completeDemo,
  } = useOnboardingStore();

  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const stepDef = ONBOARDING_STEPS[currentStepIndex] ?? ONBOARDING_STEPS[0];

  const handleRunAgentTurn = () => {
    setIsRunningAgent(true);
    const store = useConversationStore.getState();

    pushThought("Poly starting onboarding research…", { tool: "onboarding.start" });

    store.sendMessage(
      "Search the web via TinyFish for deep work and attention residue research, open the primary paper in the browser, and build a flashcards tool for my dock.",
      {
        onExperienceCreated: (exp) => {
          pushThought(`Built tool: ${exp.title}`, { tool: "create_plugin" });
        },
        onOpenExperience: (expId) => {
          useDockStore.getState().openTool(expId);
          useDockStore.getState().focusTool(expId);
        },
      }
    );
  };

  const handleStepSelect = (stepId: OnboardingStep) => {
    setStep(stepId);
    const dock = useDockStore.getState();

    switch (stepId) {
      case "intro":
        pushThought("Poly is active and ready");
        break;
      case "research":
        pushThought("Searching the web via TinyFish: deep work protocols...", {
          tool: "search_web",
        });
        setTimeout(() => {
          pushThought("Reading primary sources via TinyFish…", {
            tool: "fetch_page",
          });
        }, 1500);
        break;
      case "workspace":
        dock.openTool("browser");
        dock.focusTool("browser");
        pushThought("Opening primary source in native Browser surface", {
          tool: "browser",
        });
        break;
      case "tools":
        dock.openTool("deep-work-flashcards");
        dock.focusTool("deep-work-flashcards");
        pushThought("Opening deep work flashcards in dock…");
        break;
      case "handoff":
        pushThought("Your workspace is ready");
        break;
    }
  };

  return (
    <div className="flex h-full w-full max-w-2xl flex-col justify-between p-8 font-sans text-foreground select-none">
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">Live product walkthrough</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Watch Poly operate your dock, search primary sources via TinyFish, and synthesize tools
            </p>
          </div>
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Close
            </Button>
          )}
        </div>

        {/* Steps navigation: clean button group, no divider line */}
        <div className="flex flex-wrap items-center gap-1.5">
          {ONBOARDING_STEPS.map((step) => {
            const isActive = step.id === currentStep;
            return (
              <Button
                key={step.id}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                onClick={() => handleStepSelect(step.id)}
              >
                {step.title}
              </Button>
            );
          })}
        </div>

        {/* Step description surface: subtle bg-card step without borders */}
        <div className="flex min-h-[200px] flex-col justify-between rounded-lg bg-card p-6">
          <div className="flex flex-col gap-3">
            <div className="text-xs text-muted-foreground">
              Step {currentStepIndex + 1} of {ONBOARDING_STEPS.length}
            </div>
            <div className="text-lg font-medium leading-snug">{stepDef.title}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">{stepDef.subtitle}</p>

            {currentStep === "intro" && (
              <p className="text-sm leading-relaxed text-foreground mt-2">
                The dock is your control surface. Instead of typing into a separate chat window, Poly operates real tools, opens real browser tabs, and synthesizes software directly on screen.
              </p>
            )}

            {currentStep === "research" && (
              <p className="text-sm leading-relaxed text-foreground mt-2">
                Poly uses TinyFish web discovery to find authoritative papers and articles. Results stream above the dock and save directly to your workspace.
              </p>
            )}

            {currentStep === "workspace" && (
              <p className="text-sm leading-relaxed text-foreground mt-2">
                External pages open in remote Chromium browser sessions. Sites that block embedding run without friction beside your notes and tools.
              </p>
            )}

            {currentStep === "tools" && (
              <p className="text-sm leading-relaxed text-foreground mt-2">
                Poly builds tools tailored to what you are doing, mounts them in the dock, and keeps state in your local workspace.
              </p>
            )}

            {currentStep === "handoff" && (
              <p className="text-sm leading-relaxed text-foreground mt-2">
                Your workspace is ready. Pin what you use often, close what you finish, and tell Poly what you want to explore next.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <Button onClick={handleRunAgentTurn}>
          {isRunningAgent ? "Agent working…" : "Ask Poly to run demo"}
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevStep} disabled={currentStepIndex === 0}>
            Previous
          </Button>
          {currentStepIndex < ONBOARDING_STEPS.length - 1 ? (
            <Button variant="outline" size="sm" onClick={nextStep}>
              Next
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                completeDemo();
                onDismiss?.();
              }}
            >
              Finish
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
