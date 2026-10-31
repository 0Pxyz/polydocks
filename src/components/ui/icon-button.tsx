import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  size?: 40 | 32;
  active?: boolean;
  working?: boolean;
  badge?: number | string;
  tooltipDetail?: string;
  shortcutHint?: string | null;
}

/**
 * Shared dock/panel icon button: 40px default (32px compact),
 * token colors, focus-visible ring, hover/focus tooltip, badge,
 * background-task dot. Replaces the three ad-hoc tooltip copies
 * in AgenticDock.
 */
function IconButton({
  icon,
  label,
  size = 40,
  active = false,
  working = false,
  badge,
  tooltipDetail,
  shortcutHint,
  className,
  ...props
}: IconButtonProps) {
  const dims = size === 40 ? "w-10 h-10 min-w-[40px]" : "w-8 h-8 min-w-[32px]";
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "true" : undefined}
      aria-busy={working || undefined}
      className={cn(
        "group relative flex items-center justify-center rounded-xl transition-all duration-150 cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-lime)]",
        dims,
        active ? "text-[var(--accent-lime)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
        working && !active && "text-[var(--accent-lime)]",
        className
      )}
      {...props}
    >
      {icon}
      {badge !== undefined && (
        <span className="pointer-events-none absolute -top-1 -right-1 z-10 min-w-5 h-5 px-1 rounded-full bg-[var(--overlay-strong)] text-[var(--text-main)] text-[10px] font-mono font-semibold flex items-center justify-center">
          {badge}
        </span>
      )}
      {badge === undefined && working && (
        <span className="pointer-events-none absolute -top-0.5 -right-0.5 z-10 h-2 w-2 rounded-full bg-[var(--accent-lime)] animate-pulse" />
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 bg-[var(--bg-surface-overlay)] text-[var(--text-main)] text-[11px] px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50 -top-8"
      >
        {label}
        {tooltipDetail ? <span className="text-[var(--text-muted)]"> — {tooltipDetail}</span> : null}
        {shortcutHint ? <span className="text-[var(--text-muted)]"> · {shortcutHint}</span> : null}
      </span>
    </button>
  );
}

export { IconButton };
