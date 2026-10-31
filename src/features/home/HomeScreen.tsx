import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Orb } from "@/features/agent/Orb";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

const HINT_SEEN_KEY = "polymax-home-hint-seen";

/**
 * Quiet rotating tips for returning users (the first-run Ctrl K hint is
 * gone, but the spot stays useful). Plain copy the agent can rewrite at
 * any time — no tool call, no endpoint, just edit this list.
 */
const ROTATING_TIPS = [
  "Ask anything, or give a dock command…",
  "Tip: Ctrl Shift P opens dock search",
  "Your plugins live in the dock",
  "Try: change my background",
];

export interface HomeScreenProps {
  /** Open the agent chat panel (same panel as Ctrl K / dock agent icon). */
  onOpenAgent: () => void;
  panelOpen: boolean;
  className?: string;
}

/**
 * Living desktop: wallpaper + one orb. Nothing else in the center.
 * The orb shares its layoutId with the chat panel orb so opening the
 * panel slides this orb down into place — never two orbs on screen.
 * The prompt box, plugin tiles and placeholders were removed: everything
 * runs through the agent panel, and plugins live in the dock.
 */
export function HomeScreen({ onOpenAgent, panelOpen, className = "" }: HomeScreenProps) {
  const [hintVisible, setHintVisible] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(HINT_SEEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const isReduced = prefersReducedMotion();
  const isCoarse =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  // Quiet Ctrl K hint after ~3s idle (or on hover via CSS); gone after first use.
  useEffect(() => {
    if (hintDismissed || panelOpen) return;
    const t = setTimeout(() => setHintVisible(true), 3000);
    return () => clearTimeout(t);
  }, [hintDismissed, panelOpen]);

  // Returning users: rotate a subtle tip every ~12s while idle. Same
  // quiet spot, never a prompt box; pauses while the panel is open.
  useEffect(() => {
    if (!hintDismissed || panelOpen) return;
    const t = setInterval(() => setTipIndex((i) => (i + 1) % ROTATING_TIPS.length), 12000);
    return () => clearInterval(t);
  }, [hintDismissed, panelOpen]);

  const openAgent = () => {
    try {
      window.localStorage.setItem(HINT_SEEN_KEY, "1");
    } catch {
      // Non-fatal: hint simply shows again next visit.
    }
    setHintDismissed(true);
    onOpenAgent();
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center max-w-xl w-full px-4 pt-6 sm:pt-10 pb-6 my-auto select-none",
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {!panelOpen && (
          <motion.div
            key="home-orb"
            initial={false}
            exit={isReduced ? { opacity: 0 } : { opacity: 0, y: 48, scale: 0.6 }}
            transition={{ duration: 0.22, ease: "easeIn" }}
            className="flex flex-col items-center w-full"
          >
            {/* The one orb: the same Orb component as the chat panel,
                breathing when idle, still under reduced motion. */}
            <motion.button
              type="button"
              layoutId="agent-orb-shared"
              onClick={openAgent}
              data-home-orb
              aria-label="Talk to your agent — starts voice mode"
              title="Talk to your agent — starts voice mode"
              transition={isReduced ? { duration: 0 } : { duration: 0.28, ease: "easeOut" }}
              className="group relative rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-lime)]"
            >
              <Orb state="idle" size={isCoarse ? "xl" : "sm"} />
            </motion.button>

            {/* Quiet hint: Ctrl K on desktop, tap on touch. Never a second prompt box. */}
            {!hintDismissed ? (
              <div
                className={cn(
                  "mt-6 h-5 text-xs text-[var(--text-muted)] font-sans transition-opacity duration-500",
                  hintVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                aria-hidden="true"
              >
                {isCoarse ? "Tap to talk" : "Ctrl K"}
              </div>
            ) : (
              <div
                key={tipIndex}
                className={cn(
                  "mt-6 h-5 text-xs text-[var(--text-muted)] font-sans",
                  !isReduced && "animate-in fade-in duration-500"
                )}
                aria-hidden="true"
              >
                {ROTATING_TIPS[tipIndex]}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
