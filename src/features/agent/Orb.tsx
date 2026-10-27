import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { RotateCcw } from "lucide-react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

interface OrbProps {
  state: OrbState;
  size?: "sm" | "md" | "lg";
  accentColor?: string;
  onClick?: () => void;
  className?: string;
  audioLevel?: number; // 0 to 1 from analyser
}

/**
 * Polymax Agent Orb:
 * A dark horizon-light spherical orb inspired by the reference control sheet.
 * Reflects theme accent, audio reactivity, and states (idle, listening, thinking, speaking, error).
 */
export function Orb({
  state,
  size = "sm",
  accentColor = "var(--accent-lime)",
  onClick,
  className,
  audioLevel = 0,
}: OrbProps) {
  const sizeMap = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
  };

  const scaleBoost =
    state === "listening" || state === "speaking"
      ? 1 + audioLevel * 0.18
      : 1;

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "relative flex items-center justify-center select-none group focus:outline-none",
        onClick && "cursor-pointer",
        className
      )}
      title={
        state === "thinking"
          ? "Thinking… Tap to abort"
          : state === "error"
          ? "Something went wrong. Tap to retry"
          : state === "listening"
          ? "Listening… Tap to stop"
          : "Polymax Agent"
      }
    >
      {/* Outer ambient glow halo */}
      <motion.div
        animate={{
          scale:
            state === "thinking"
              ? [1, 1.12, 1]
              : state === "speaking" || state === "listening"
              ? [scaleBoost, scaleBoost * 1.1, scaleBoost]
              : [1, 1.05, 1],
          opacity:
            state === "thinking"
              ? [0.4, 0.75, 0.4]
              : state === "error"
              ? 0.35
              : [0.25, 0.45, 0.25],
        }}
        transition={{
          repeat: Infinity,
          duration: state === "thinking" ? 2 : 3,
          ease: "easeInOut",
        }}
        className={cn(
          "absolute rounded-full blur-xl pointer-events-none transition-all duration-300",
          sizeMap[size]
        )}
        style={{
          background:
            state === "error"
              ? "radial-gradient(circle, rgba(239, 68, 68, 0.6) 0%, transparent 70%)"
              : `radial-gradient(circle, ${accentColor} 0%, transparent 75%)`,
        }}
      />

      {/* Main Orb Body */}
      <motion.div
        animate={{
          scale: scaleBoost,
          rotate: state === "thinking" ? 360 : 0,
        }}
        transition={
          state === "thinking"
            ? { repeat: Infinity, duration: 6, ease: "linear" }
            : { type: "spring", stiffness: 300, damping: 25 }
        }
        className={cn(
          "relative rounded-full overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/10 transition-shadow duration-300",
          sizeMap[size]
        )}
        style={{
          background: "radial-gradient(circle at 50% 30%, #1c2230 0%, #0a0c12 80%)",
        }}
      >
        {/* Horizon light slit (inspired by the reference photo) */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{
              opacity:
                state === "thinking"
                  ? [0.6, 1, 0.6]
                  : state === "speaking"
                  ? [0.7, 1, 0.8]
                  : 0.8,
              scaleX:
                state === "speaking"
                  ? [0.85, 1.1, 0.95]
                  : state === "listening"
                  ? [0.9, 1.05, 0.9]
                  : 1,
            }}
            transition={{
              repeat: Infinity,
              duration: state === "thinking" ? 1.6 : 2.4,
              ease: "easeInOut",
            }}
            className="w-4/5 h-[3px] rounded-full blur-[1px]"
            style={{
              background:
                state === "error"
                  ? "linear-gradient(90deg, transparent 0%, rgba(248,113,113,0.9) 50%, transparent 100%)"
                  : `linear-gradient(90deg, transparent 0%, #ffffff 40%, ${accentColor} 60%, transparent 100%)`,
              boxShadow:
                state === "error"
                  ? "0 0 10px rgba(239, 68, 68, 0.8)"
                  : `0 0 12px ${accentColor}`,
            }}
          />
        </div>

        {/* Top reflection highlight */}
        <div
          className="absolute -top-1 left-1/4 right-1/4 h-1/3 rounded-full opacity-30 blur-[2px] pointer-events-none"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.7) 0%, transparent 100%)",
          }}
        />

        {/* Dynamic Waveform rings when listening */}
        {state === "listening" && (
          <motion.div
            animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "easeOut" }}
            className="absolute inset-1 rounded-full border border-white/40 pointer-events-none"
          />
        )}

        {/* Error icon overlay */}
        {state === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-red-400">
            <RotateCcw className="w-5 h-5 group-hover:rotate-45 transition-transform" />
          </div>
        )}
      </motion.div>
    </div>
  );
}
