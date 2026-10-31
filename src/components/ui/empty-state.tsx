import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Shared empty state: icon + title + hint + optional action.
 */
function EmptyState({ icon, title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-8 px-4 text-center", className)}>
      <div className="text-[var(--text-dim)]">{icon}</div>
      <p className="text-[13px] font-medium text-[var(--text-main)]">{title}</p>
      {hint && <p className="text-xs text-[var(--text-muted)] max-w-[28ch]">{hint}</p>}
      {action}
    </div>
  );
}

export { EmptyState };
