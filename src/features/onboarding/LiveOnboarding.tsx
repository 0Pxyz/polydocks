import { useEffect, useRef, useState } from "react";
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
  ONBOARDING_STEP_PROMPTS,
} from "@/lib/store/useOnboardingStore";
import { pushThought } from "@/lib/agent/thoughtStream";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { useDockStore } from "@/lib/store/useDockStore";
import { shouldPauseTourOnTakeover } from "@/lib/onboarding/tourTakeover";
import { useThemeStore } from "@/lib/theme";
import {
  isDemoAutoplay,
  isDemoBusy,
  stopDemoAutoplay,
  restoreThemeSnapshot,
  restoreDockSnapshot,
  deleteDemoData,
  runDemoStep,
  snapshotStep,
  undoDemoStep,
  subscribeSpot,
  getSpotSelector,
  isLiveAuto,
  stopLiveAuto,
  runLiveAutoStep,
  snapshotDockOnce,
} from "@/lib/onboarding/demoScript";
import { TINYFISH_LOGO_SRC } from "@/lib/agent/events";
import { cn } from "@/lib/cn";
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
  // Subscribed above the idle early-return: conditional hooks crash the
  // closed→open transition with "rendered more hooks".
  const chatSheetOpen = useConversationStore((s) => s.layoutState) === "sheet";

  const stepDef = ONBOARDING_STEPS[currentStepIndex] ?? ONBOARDING_STEPS[0];

  // Auto-advance timer when playing and not paused. While the agent is
  // streaming, a demo script is playing, or any scripted turn is in
  // flight (view- or engine-started), the tick reschedules instead of
  // advancing — a step change mid-run would silently kill the script.
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const [demoPlaying, setDemoPlaying] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const tick = () => {
      if (paused || !isPlaying || isStreaming || demoPlaying || isDemoBusy()) {
        timerRef.current = setTimeout(tick, 1500);
        return;
      }
      if (currentStepIndex < ONBOARDING_STEPS.length - 1) {
        nextStep();
      } else {
        completeDemo();
      }
    };
    timerRef.current = setTimeout(tick, stepDef.durationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen, paused, isPlaying, isStreaming, demoPlaying, currentStepIndex, stepDef.durationMs, nextStep, completeDemo]);

  // Pause freezes both auto chains in place (the step gate loops while
  // paused, the timer reschedules); resume continues where it stopped.
  // Pause must NOT stop autoplay — stopping cancels the in-flight script
  // and the tour could never resume (the engine only kicks on step entry).
  useEffect(() => {
    if (!isOpen) {
      stopDemoAutoplay();
      stopLiveAuto();
      restoreThemeSnapshot();
      restoreDockSnapshot();
      void deleteDemoData();
    }
  }, [isOpen]);

  // Orchestrate dock and bottom chat on step entry
  useEffect(() => {
    if (!isOpen) return;

    // Entry snapshot for prev-step undo (theme + dock, not data).
    snapshotStep();

    const dock = useDockStore.getState();
    // The demo narrative keeps Poly's bottom chat visible while the
    // workspace changes: operative stages raise the bottom sheet (never
    // the side panel), so tool activity stays on screen. The user's dock
    // position is never overridden — only the chat layout.
    const target = stepDef.dockTarget;
    if (target === "agent") {
      dock.openTool("agent");
      const convo = useConversationStore.getState();
      if (convo.layoutState !== "sheet") {
        // Collapse side/full to the bottom sheet for the demo narrative.
        convo.setLayoutState("sheet");
      }
    } else if (target) {
      dock.openTool(target);
    }
    // Home stage: leave the dock alone so the existing workspace, notes,
    // reader, and settings stay exactly as the user left them.
    forcedToolRef.current = target || null;

    // Real prompt draft for the operative stages: the walkthrough shows
    // the actual prompt the agent will process. The user (or demo runner)
    // still sends — the tour never fabricates results.
    const prompt = ONBOARDING_STEP_PROMPTS[currentStep];
    if (prompt) useConversationStore.getState().setDraft(prompt);

    switch (currentStep) {
      case "home":
        pushThought("Poly is active and ready — Ctrl+K to talk, Ctrl+Shift+1…9 to jump tools");
        break;

      case "customize":
        pushThought("Real turn: Poly cycles themes and dock styles, then settles on default…");
        break;

      case "research":
        pushThought("Real turn: Poly researches with TinyFish — watch the bottom chat…");
        break;

      case "read":
        pushThought("Real turn: Poly opens the video in the reader, then returns…");
        break;

      case "build":
        pushThought("Real turn: Poly generates and installs the dashboard plugin…");
        break;

      case "remember":
        pushThought("Real turn: Poly saves memory and opens Notes…");
        break;

      case "handoff":
        pushThought("Your workspace is ready");
        break;
    }

    // Drop pending thought callbacks on step change/close so no ghost
    // reasoning fires after the user moved on or skipped.
    //
    // Demo autoplay: token-free scripted run (no model). The Play button
    // starts the chain; each step entry continues it until handoff, pause
    // or skip. Handoff has no script — the timer completes the tour.
    if (isDemoAutoplay() && currentStep !== "idle" && currentStep !== "handoff") {
      const store = useOnboardingStore.getState();
      stopLiveAuto();
      snapshotDockOnce();
      setDemoPlaying(true);
      void runDemoStep(currentStep).then(
        (ran) => {
          setDemoPlaying(false);
          if (!ran || !isDemoAutoplay()) return;
          store.nextStep();
        },
        (err) => {
          setDemoPlaying(false);
          if (String((err as Error)?.message) === "demo-cancelled") return;
          stopDemoAutoplay();
          pushThought("Demo step hit a snag — continuing manually…");
        }
      );
    }

    // Live auto tour: typed prompt + real send, chained to the end.
    // Handoff has no prompt — the timer completes the tour.
    const livePrompt = ONBOARDING_STEP_PROMPTS[currentStep];
    if (isLiveAuto() && livePrompt && currentStep !== "idle" && currentStep !== "handoff") {
      setDemoPlaying(true);
      void runLiveAutoStep(currentStep, livePrompt, { onBusyChange: setDemoPlaying }).catch(() => {
        setDemoPlaying(false);
      });
    }

    return () => {
      for (const t of thoughtTimersRef.current) clearTimeout(t);
      thoughtTimersRef.current = [];
    };
  }, [isOpen, currentStep]);

  // User takeover: any manual dock switch while the tour plays pauses it
  // (stops the auto-advance timer and the focus stealing). Resume with the
  // pill play button, dismiss with Skip/Esc. Never fires on the tour's own
  // focus changes — see shouldPauseTourOnTakeover — nor while a scripted
  // turn is in flight (its focus moves ARE the choreography).
  useEffect(() => {
    const prev = lastSeenRef.current;
    lastSeenRef.current = { wasOpen: isOpen, step: currentStep, tool: activeToolId };
    if (!prev) return;
    if (isDemoBusy()) return;
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

  // Undo the current step's visual changes, then step back. Data
  // writes dedupe, so replaying forward never stacks duplicates.
  const handlePrevStep = () => {
    undoDemoStep();
    prevStep();
  };

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
        handlePrevStep();
      } else if (e.key === " ") {
        e.preventDefault();
        setPaused(!paused);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, paused, skipDemo, nextStep, prevStep]);

  if (!isOpen || currentStep === "idle") return null;

  // Position opposite to the dock so it never collides! When the floating
  // chat sheet is open and the pill sits at the bottom, stack it above the
  // measured chat height instead of a fixed offset (overlap regression:
  // the sheet grows with the text). Read/build stages show center-stage
  // features, so the pill pins to the top and never covers them. z-50
  // keeps the tour controls above the z-40 chat surface.
  const pinTop = currentStep === "read" || currentStep === "build";
  const isDockTop = dockPosition === "top";
  const pillAboveChat = isDockTop && chatSheetOpen && !pinTop;
  const positionClass = pinTop || !isDockTop
    ? "top-8 left-1/2 -translate-x-1/2"
    : "bottom-8 left-1/2 -translate-x-1/2";
  const positionStyle = pillAboveChat
    ? { bottom: "calc(var(--dock-bottom-offset, 88px) + var(--chat-sheet-height, 0px) + 12px)" }
    : undefined;

  // Research-stage "live search" branding: real TinyFish logo, staggered
  // find chips. Animations run only while the step is active
  // and unpaused; paused/reduced-motion renders the same marks static.
  const isResearch = currentStep === "research";
  const searching = isResearch && isPlaying && !paused;

  const yOffset = isReduced ? 0 : isDockTop ? 20 : -20;

  return (
    <>
    <DemoSpotlight />
    <div
      className={`fixed ${positionClass} z-50 pointer-events-auto select-none max-w-xl w-[calc(100%-2rem)]`}
      style={positionStyle}
      aria-label="Live product demonstration"
    >
      <motion.div
        initial={{ opacity: 0, y: yOffset }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: yOffset }}
        transition={spring.soft}
        className={cn(
          "flex w-full gap-3 px-4 py-2 bg-[var(--bg-void)]/95 border border-white/10 shadow-2xl backdrop-blur-xl justify-between",
          isResearch ? "flex-col rounded-2xl gap-1.5" : "flex-row items-center rounded-full"
        )}
      >
        <style>{ONBOARDING_CHIP_CSS}</style>
        <div className="flex items-center gap-3 w-full justify-between">
        {/* Step Info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-lime)] shrink-0 animate-pulse" />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              {isResearch && (
                <img
                  src={TINYFISH_LOGO_SRC}
                  alt="TinyFish"
                  width={14}
                  height={14}
                  className={cn(
                    "w-3.5 h-3.5 rounded-full object-cover shrink-0",
                    searching && !isReduced && "animate-pulse"
                  )}
                />
              )}
              <span className="text-xs font-semibold text-foreground line-clamp-2 leading-tight">
                {stepDef.title}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                ({currentStepIndex + 1}/{ONBOARDING_STEPS.length})
              </span>
            </div>
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

          {/* Prev / Next (prev undoes the step's visual changes first) */}
          <button
            type="button"
            onClick={handlePrevStep}
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
        </div>
        {/* Research finds: kind chips with the TinyFish seal, staggered in
            while the step runs. Static when paused or skipped, so the
            motion never outlives the active step. */}
        {isResearch && (
          <div
            key={`research-chips-${currentStepIndex}`}
            className="flex items-center gap-1.5 pl-7"
            aria-label="Sources found via TinyFish"
          >
            {ONBOARDING_RESEARCH_CHIPS.map((chip, i) => (
              <span
                key={chip.kind}
                title={`Discovered via TinyFish: ${chip.label}`}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
                style={
                  searching && !isReduced
                    ? { animation: "onboard-chip-in .28s ease-out both", animationDelay: `${i * 300}ms` }
                    : undefined
                }
              >
                <img
                  src={TINYFISH_LOGO_SRC}
                  alt=""
                  aria-hidden
                  width={10}
                  height={10}
                  className="w-2.5 h-2.5 rounded-full object-cover shrink-0"
                />
                {chip.label}
              </span>
            ))}
          </div>
        )}
      </motion.div>
    </div>
    </>
  );
}

/**
 * Cursor/highlight ring for the scripted tour: a rounded outline that
 * moves to whatever the demo is driving (dock tool, composer, dashboard).
 * Pointer-transparent and below the tour pill; static under reduced
 * motion. Driven by demoScript.spotTo — cleared at every step end.
 */
function DemoSpotlight() {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const isReduced = prefersReducedMotion();

  useEffect(() => {
    const update = () => {
      const sel = getSpotSelector();
      if (!sel) {
        setRect(null);
        return;
      }
      const el = document.querySelector(sel);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    const unsub = subscribeSpot(update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      unsub();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!rect || rect.width === 0) return null;
  const pad = 6;
  return (
    <div
      aria-hidden
      className={
        "pointer-events-none fixed z-40 rounded-2xl border-2 border-[var(--accent-lime)] shadow-[0_0_24px_rgba(200,255,87,0.25)]" +
        (isReduced ? "" : " transition-all duration-300")
      }
      style={{
        left: Math.max(4, rect.left - pad),
        top: Math.max(4, rect.top - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }}
    />
  );
}

const ONBOARDING_RESEARCH_CHIPS = [
  { kind: "article", label: "Article" },
  { kind: "video", label: "Video" },
  { kind: "blog", label: "Blog" },
] as const;

const ONBOARDING_CHIP_CSS = `
@keyframes onboard-chip-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; }
}
`;
