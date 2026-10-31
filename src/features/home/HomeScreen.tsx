import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MiniOrb } from "@/components/icons/MiniOrb";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

const HINT_SEEN_KEY = "polymax-home-hint-seen";

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
            {/* The one orb: MiniOrb breathes when idle, still when reduced-motion */}
            <motion.button
              type="button"
              layoutId="agent-orb-shared"
              onClick={openAgent}
              data-home-orb
              aria-label="Talk to your agent (Ctrl K)"
              title="Talk to your agent (Ctrl K)"
              transition={isReduced ? { duration: 0 } : { duration: 0.28, ease: "easeOut" }}
              className="group relative rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-lime)]"
            >
              <MiniOrb state="idle" size={isCoarse ? 112 : 68} />
            </motion.button>

            {/* Quiet hint: Ctrl K on desktop, tap on touch. Never a second prompt box. */}
            {!hintDismissed && (
              <div
                className={cn(
                  "mt-6 h-5 text-xs text-[var(--text-muted)] font-sans transition-opacity duration-500",
                  hintVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                aria-hidden="true"
              >
                {isCoarse ? "Tap to talk" : "Ctrl K"}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
