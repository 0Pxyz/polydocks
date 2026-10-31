import { X } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export interface TabItemProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  active?: boolean;
  dirty?: boolean;
  running?: boolean;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  onBackground?: (id: string) => void;
  index?: number;
}

/**
 * Shared tab item for dock and chat sidebar. One visual system:
 * same animation (spring.soft + layout), same registry, same
 * persisted state. Host keeps inactive tabs mounted with `hidden`.
 *
 * - Click selects, X closes (32px hit area, 44px on coarse pointers).
 * - Middle-click closes, double-click backgrounds (keeps running).
 * - Reorder handled by the parent via `layout` + persisted order.
 */
function TabItem({
  id,
  title,
  icon,
  active = false,
  dirty = false,
  running = false,
  onSelect,
  onClose,
  onBackground,
  index,
}: TabItemProps) {
  return (
    <motion.div
      layout
      transition={spring.soft}
      role="tab"
      aria-selected={active}
      aria-label={title}
      data-tab-id={id}
      data-tab-index={index}
      onClick={() => onSelect(id)}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose?.(id);
        }
      }}
      onDoubleClick={() => onBackground?.(id)}
      className={cn(
        "group relative flex items-center gap-1.5 h-9 pl-2.5 pr-1.5 rounded-[var(--radius-md)] cursor-pointer select-none shrink-0",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-lime)]",
        active
          ? "bg-[var(--overlay-strong)] text-[var(--text-main)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--overlay-subtle)]"
      )}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
      }}
    >
      {icon}
      <span className="text-[13px] font-medium truncate max-w-[140px]">{title}</span>
      {dirty && <span aria-label="Unsaved changes" className="h-1.5 w-1.5 rounded-full bg-[var(--accent-lime)] shrink-0" />}
      {running && !dirty && (
        <span aria-label="Running" className="h-1.5 w-1.5 rounded-full bg-[var(--accent-lime)] animate-pulse shrink-0" />
      )}
      {onClose && (
        <button
          type="button"
          aria-label={`Close ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            onClose(id);
          }}
          className="w-8 h-8 min-w-[32px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--overlay-hover)] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100 transition-opacity [@media(pointer:coarse)]:opacity-100 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11"
        >
          <X size={14} />
        </button>
      )}
    </motion.div>
  );
}

export { TabItem };
