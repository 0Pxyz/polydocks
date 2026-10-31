import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface PanelHeaderProps {
  title: string;
  /** Custom title node (e.g. a menu trigger). Renders instead of the plain title. */
  titleNode?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
}

/**
 * Shared panel header: same height/padding across dock, chat, and panels.
 */
function PanelHeader({ title, titleNode, actions, onClose, closeLabel = "Close panel", className }: PanelHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between h-11 px-3 shrink-0", className)}>
      {titleNode ?? (
        <h2 className="text-[13px] font-semibold text-[var(--text-main)] truncate">{title}</h2>
      )}
      <div className="flex items-center gap-1">
        {actions}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="w-8 h-8 min-w-[32px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--overlay-subtle)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-lime)]"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export { PanelHeader };
