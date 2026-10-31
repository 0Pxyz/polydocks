import type { ComponentType } from "react";
import { resolveIcon } from "./adapter";
import type { MiniOrbState } from "./MiniOrb";
import { prefersReducedMotion } from "@/lib/motion";

export interface DockIconProps {
  /** Icon name (Phosphor id, legacy Lucide id, or tool id), or a direct React component */
  icon?: string | ComponentType<{
    size?: number | string;
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
    className?: string;
    style?: React.CSSProperties;
  }>;
  name?: string;
  isActive?: boolean;
  isAgent?: boolean;
  agentState?: MiniOrbState;
  isAgentWorking?: boolean;
  /** Agent needs the user (e.g. pending approval): accent pulse. */
  needsAttention?: boolean;
  useAgentStaticFallback?: boolean;
  size?: number;
  className?: string;
}

/**
 * Agent ring glyph: one accent color, three states. Static ring when idle,
 * rotating arc while working, accent pulse when the agent needs the user
 * (e.g. a pending approval). Still under reduced motion.
 */
function AgentRing({
  working = false,
  needsAttention = false,
  active = false,
}: {
  working?: boolean;
  needsAttention?: boolean;
  active?: boolean;
}) {
  const isReduced = prefersReducedMotion();
  const showAccent = active || needsAttention || working;
  return (
    <div className="w-10 h-10 flex items-center justify-center select-none" aria-hidden="true">
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        className={
          working && !isReduced
            ? "animate-spin text-[var(--accent-lime)]"
            : needsAttention && !isReduced
              ? "animate-pulse text-[var(--accent-lime)]"
              : showAccent
                ? "text-[var(--accent-lime)]"
                : "text-white/25"
        }
        style={working && !isReduced ? { animationDuration: "1.4s" } : undefined}
      >
        {/* Base ring: symmetric, unaffected by the working spin. */}
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" opacity={showAccent ? 0.25 : 1} />
        {working ? (
          <circle
            cx="12"
            cy="12"
            r="8.5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="16 38"
          />
        ) : (
          showAccent && <circle cx="12" cy="12" r="3" fill="currentColor" />
        )}
      </svg>
    </div>
  );
}

/**
 * DockIcon component:
 * - 20 to 22px glyph inside a 40px hit area
 * - Consistent Phosphor regular stroke weight
 * - Muted foreground when inactive, crisp foreground on hover (150ms transition)
 * - Duotone variant in neon lime accent with soft glow when active (no white outline, no blue)
 * - Animated Mini Orb with idle, thinking, speaking, and background pulse states for agent
 */
export function DockIcon({
  icon,
  name,
  isActive = false,
  isAgent = false,
  agentState: _agentState,
  isAgentWorking = false,
  needsAttention = false,
  useAgentStaticFallback = false,
  size = 20,
  className = "",
}: DockIconProps) {
  if (isAgent && !useAgentStaticFallback) {
    // Ring glyph: idle static, rotating arc while working, accent pulse
    // when the agent needs the user. The home screen uses the full chat
    // Orb; the dock keeps this lighter ring at icon size.
    return (
      <AgentRing working={isAgentWorking} needsAttention={needsAttention} active={isActive} />
    );
  }

  // Resolve component from icon or name
  const IconComponent =
    typeof icon === "function"
      ? icon
      : typeof icon === "string"
      ? resolveIcon(icon)
      : resolveIcon(name);

  const weight = isActive ? "duotone" : "regular";

  return (
    <div className={`w-10 h-10 flex items-center justify-center select-none ${className}`}>
      <IconComponent
        size={size}
        weight={weight}
        className={`transition-colors duration-150 ${
          isActive
            ? "text-[var(--accent-lime)] filter drop-shadow-[0_0_8px_rgba(200,255,87,0.4)]"
            : "text-[#9aa5b8] group-hover:text-white"
        }`}
      />
    </div>
  );
}
