import type { ComponentType } from "react";
import { resolveIcon } from "./adapter";
import { MiniOrb, type MiniOrbState } from "./MiniOrb";

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
  useAgentStaticFallback?: boolean;
  size?: number;
  className?: string;
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
  agentState,
  isAgentWorking = false,
  useAgentStaticFallback = false,
  size = 20,
  className = "",
}: DockIconProps) {
  if (isAgent && !useAgentStaticFallback) {
    const computedState: MiniOrbState =
      agentState || (isAgentWorking ? "working" : isActive ? "thinking" : "idle");

    return (
      <div className={`w-10 h-10 flex items-center justify-center ${className}`}>
        <MiniOrb state={computedState} size={size} />
      </div>
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
