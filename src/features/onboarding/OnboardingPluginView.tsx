import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { Play, Pause, ArrowRight, ArrowLeft, X, PaperPlaneRight } from "@phosphor-icons/react";
import { useOnboardingStore, ONBOARDING_STEPS, ONBOARDING_STEP_PROMPTS } from "@/lib/store/useOnboardingStore";
import { useConversationStore } from "@/lib/agent/conversationStore";
import {
  isDemoAutoplay,
  startDemoAutoplay,
  stopDemoAutoplay,
  snapshotThemeOnce,
  runDemoStep,
  startLiveAuto,
  stopLiveAuto,
  runLiveAutoStep,
  snapshotDockOnce,
  isDemoStepInFlight,
  clearDemoMarks,
  cleanupDemo,
} from "@/lib/onboarding/demoScript";
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
    completeDemo,
    startDemo,
    paused,
    setPaused,
  } = useOnboardingStore();
  const isReduced = prefersReducedMotion();
  // Hooks stay above the replay early-return: conditional hooks crash the
  // view on the closed→open transition (replay) with "rendered more hooks".
  const chatStreaming = useConversationStore((s) => s.isStreaming);
  // Token-free demo play flag — also above the replay early-return.
  const [playing, setPlaying] = useState(false);

  // The tab only mounts when focused, so it never renders null: stage
  // while the tour plays, replay entry otherwise. Completed tours land
  // here with isOpen:false — that early return blanked the viewport and
  // made the row look dead (#384). Settings → replay still works too.
  if (!isOpen || currentStep === "idle") {
    return (
      <div
        className="flex-1 w-full h-full overflow-y-auto flex flex-col items-center justify-center gap-3 px-6 py-8 font-sans select-none"
        aria-label="Product walkthrough finished"
      >
        <Orb state="idle" size="md" />
        <p className="mt-2 max-w-md px-4 text-center text-sm text-[var(--text-main)] font-medium leading-relaxed">
          Walkthrough finished — your workspace is yours.
        </p>
        <button
          type="button"
          onClick={() => startDemo(true)}
          className="mt-1 px-4 py-2 rounded-full text-xs font-medium bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] hover:bg-[var(--accent-lime)]/25 transition-colors cursor-pointer"
          title="Replay walkthrough"
        >
          Replay walkthrough
        </button>
      </div>
    );
  }

  const stepDef = ONBOARDING_STEPS[currentStepIndex] ?? ONBOARDING_STEPS[0];
  const stepPrompt = ONBOARDING_STEP_PROMPTS[currentStep];

  const orbState =
    currentStep === "research" || currentStep === "read" || currentStep === "build"
      ? "thinking"
      : currentStep === "home"
        ? "listening"
        : "idle";

  // Token-free demo play: scripted run over the same real stores and
  // capabilities the agent drives — no model calls, no tokens, replayable
  // (theme restored on close, feed/memory/note writes dedupe). This only
  // kicks the current step; the tour engine chains the rest. If the engine
  // is already running this step, hands off instead of double-running.
  const handlePlay = () => {
    if (playing) return;
    if (currentStep === "handoff") {
      completeDemo();
      return;
    }
    if (isDemoStepInFlight(currentStep)) return;
    const kickedStep = currentStep;
    stopDemoAutoplay();
    stopLiveAuto();
    setPaused(false);
    snapshotThemeOnce();
    snapshotDockOnce();
    startDemoAutoplay();
    setPlaying(true);
    void runDemoStep(kickedStep).then(
      (ran) => {
        setPlaying(false);
        if (!ran || !isDemoAutoplay()) return;
        // The engine effect chains on step change; only advance when it
        // hasn't already (same-step kick while the engine idles).
        if (useOnboardingStore.getState().currentStep !== kickedStep) return;
        if (currentStepIndex >= ONBOARDING_STEPS.length - 1) completeDemo();
        else nextStep();
      },
      () => {
        setPlaying(false);
        stopDemoAutoplay();
      }
    );
  };

  // Live auto tour: type the prompt like the user would, send it for
  // real, and chain every step to the end. Same typing effect on every
  // auto send; the agent really opens the screens along the way.
  const handleAutoLive = () => {
    if (playing || !stepPrompt) return;
    if (currentStep === "handoff") return;
    stopDemoAutoplay();
    startLiveAuto();
    setPlaying(true);
    void runLiveAutoStep(currentStep, stepPrompt, { onBusyChange: setPlaying }).catch(() => {
      setPlaying(false);
    });
  };

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

      {/* Play controls: scripted demo (token-free) or the live agent
          turn. Home has no prompt to type but still plays the tour. */}
      {currentStep !== "handoff" && (
        <div className="mt-4 max-w-md w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left">
          <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">Poly will run</p>
          {stepPrompt ? (
            <p className="mt-1 text-xs leading-relaxed text-white/85 line-clamp-4">{stepPrompt}</p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-white/85">A guided tour of this workspace — no typing needed.</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handlePlay}
              disabled={playing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] hover:bg-[var(--accent-lime)]/25 disabled:opacity-50 transition-colors cursor-pointer"
              title="Play the scripted demo — no tokens, replayable"
            >
              <Play size={13} weight="fill" />
              {playing ? "Playing…" : "Play demo"}
            </button>
            {stepPrompt ? (
              <button
                type="button"
                onClick={handleAutoLive}
                disabled={playing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-50 transition-colors cursor-pointer"
                title="Type the prompt like you would, send it for real, and chain every step to the end"
              >
                <PaperPlaneRight size={13} />
                {playing ? "Auto live…" : chatStreaming ? "Auto live…" : "Auto live tour"}
              </button>
            ) : null}
          </div>
          {chatStreaming && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">Poly is working — the auto tour continues when this turn settles.</p>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground">Demo play is scripted and free; auto live types, sends, and chains every step.</p>
        </div>
      )}

      {/* Handoff: adopt the demo workspace or wipe the tour's trace. */}
      {currentStep === "handoff" && (
        <div className="mt-4 max-w-md w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left">
          <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">Tour complete</p>
          <p className="mt-1 text-xs leading-relaxed text-white/85">Keep this workspace as-is, or clean up every demo trace.</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                clearDemoMarks();
                completeDemo();
                onDismiss?.();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] hover:bg-[var(--accent-lime)]/25 transition-colors cursor-pointer"
              title="Keep the demo theme, feed, notes and layout"
            >
              Manter este workspace
            </button>
            <button
              type="button"
              onClick={() => {
                void cleanupDemo().finally(() => {
                  completeDemo();
                  onDismiss?.();
                });
              }}
              className="inline-flex items-center px-3 py-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
              title="Restore the pre-tour look and delete demo sources and notes"
            >
              Limpar demo
            </button>
          </div>
        </div>
      )}

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
