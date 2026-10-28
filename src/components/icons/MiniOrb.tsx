import { motion } from "motion/react";
import { prefersReducedMotion } from "@/lib/motion";
import { Sparkle } from "@phosphor-icons/react";

export type MiniOrbState = "idle" | "thinking" | "speaking" | "working";

export interface MiniOrbProps {
  state?: MiniOrbState;
  size?: number;
  className?: string;
  useFallback?: boolean;
}

/**
 * Polymax Agent Mini Orb (~20px SVG)
 * Mirrors the main chat Orb: dark sphere, accent horizon glow, specular highlight.
 * States:
 * - idle: slow breathing (3.5s)
 * - thinking: gentle shimmer sweep
 * - speaking: energetic rhythmic pulse
 * - working: soft accent beacon pulse while chat is closed
 * Fully honors prefers-reduced-motion by remaining static.
 */
export function MiniOrb({
  state = "idle",
  size = 20,
  className = "",
  useFallback = false,
}: MiniOrbProps) {
  const isReduced = prefersReducedMotion();

  if (useFallback) {
    return (
      <Sparkle
        size={size}
        weight={state === "idle" ? "regular" : "duotone"}
        className={`text-[var(--accent-lime)] transition-colors duration-150 ${className}`}
      />
    );
  }

  // Animation variants
  const haloAnimate = isReduced
    ? { scale: 1, opacity: 0.4 }
    : state === "thinking"
    ? { scale: [1, 1.25, 1], opacity: [0.5, 0.9, 0.5] }
    : state === "speaking"
    ? { scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }
    : state === "working"
    ? { scale: [1, 1.2, 1], opacity: [0.4, 0.85, 0.4] }
    : { scale: [0.95, 1.08, 0.95], opacity: [0.35, 0.6, 0.35] };

  const haloTransition = isReduced
    ? { duration: 0 }
    : {
        repeat: Infinity,
        duration:
          state === "thinking" ? 1.4 : state === "speaking" ? 0.75 : state === "working" ? 1.2 : 3.2,
        ease: "easeInOut" as const,
      };

  const horizonAnimate = isReduced
    ? { opacity: 0.85 }
    : state === "thinking"
    ? { opacity: [0.6, 1, 0.6], x: [-1.5, 1.5, -1.5] }
    : state === "speaking"
    ? { opacity: [0.7, 1, 0.7], scaleY: [0.9, 1.25, 0.9] }
    : state === "working"
    ? { opacity: [0.5, 0.95, 0.5] }
    : { opacity: [0.7, 0.9, 0.7] };

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
      aria-label={`Agent Orb: ${state}`}
    >
      {/* Outer ambient glow halo */}
      <motion.div
        animate={haloAnimate}
        transition={haloTransition}
        className="absolute inset-[-2px] rounded-full blur-[3px] pointer-events-none"
        style={{
          background:
            state === "working" || state === "thinking" || state === "speaking"
              ? "radial-gradient(circle, rgba(200, 255, 87, 0.65) 0%, transparent 75%)"
              : "radial-gradient(circle, rgba(200, 255, 87, 0.4) 0%, transparent 75%)",
        }}
      />

      {/* SVG Sphere with Horizon Glow and Specular Highlight */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 block overflow-visible drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
      >
        <defs>
          {/* Sphere body gradient */}
          <radialGradient id="miniOrbSphere" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#222b38" />
            <stop offset="65%" stopColor="#0d1117" />
            <stop offset="100%" stopColor="#040608" />
          </radialGradient>

          {/* Accent horizon gradient */}
          <linearGradient id="miniOrbHorizon" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#c8ff57" stopOpacity="0" />
            <stop offset="25%" stopColor="#c8ff57" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="75%" stopColor="#c8ff57" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#c8ff57" stopOpacity="0" />
          </linearGradient>

          {/* Specular gleam */}
          <linearGradient id="miniOrbHighlight" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Horizon clip path */}
          <clipPath id="miniOrbClip">
            <circle cx="12" cy="12" r="10" />
          </clipPath>
        </defs>

        {/* Outer border ring */}
        <circle
          cx="12"
          cy="12"
          r="10.25"
          stroke="rgba(200, 255, 87, 0.35)"
          strokeWidth="0.75"
        />

        {/* Sphere dark body */}
        <circle cx="12" cy="12" r="10" fill="url(#miniOrbSphere)" />

        {/* Inner Horizon Arc & Glow (clipped inside orb) */}
        <g clipPath="url(#miniOrbClip)">
          <motion.ellipse
            cx="12"
            cy="14"
            rx="9"
            ry="4.5"
            fill="url(#miniOrbHorizon)"
            animate={horizonAnimate}
            transition={haloTransition}
            style={{ filter: "blur(0.8px)" }}
          />

          {/* Core Horizon Light Line */}
          <path
            d="M 3.5 13.5 Q 12 15.5 20.5 13.5"
            stroke="#ffffff"
            strokeWidth="0.8"
            strokeLinecap="round"
            opacity="0.9"
          />
        </g>

        {/* Specular Glint Highlight on upper sphere edge */}
        <ellipse
          cx="8.5"
          cy="6.5"
          rx="3.5"
          ry="1.8"
          fill="url(#miniOrbHighlight)"
          transform="rotate(-25 8.5 6.5)"
        />
      </svg>
    </div>
  );
}
