import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useTabHostStore } from "@/lib/tabs/tabHostStore";

const NOTICE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Inline task status for a kept-alive tab. Running tasks show a quiet
 * progress line; finished ones linger briefly as plain text so a result
 * that completed while the tab was hidden is still seen on return.
 * No badges, no overlays — plain rows inside the surface.
 */
export function TaskNotice({ tabId, className = "" }: { tabId: string; className?: string }) {
  const tasks = useTabHostStore((s) => s.tasks);
  const [dismissed, setDismissed] = useState<Record<string, true>>({});
  const visible = useMemo(() => {
    const now = Date.now();
    return Object.values(tasks).filter(
      (t) =>
        t.tabId === tabId &&
        !dismissed[t.id] &&
        (t.status === "running" || (now - t.updatedAt < NOTICE_WINDOW_MS && t.status !== "interrupted"))
    );
  }, [tasks, tabId, dismissed]);

  if (visible.length === 0) return null;
  return (
    <div className={cn("flex w-full flex-col gap-1 px-1 py-1 text-xs", className)} aria-live="polite">
      {visible.map((t) => (
        <div key={t.id} className="flex items-center gap-2 text-muted-foreground">
          {t.status === "running" && (
            <span className="h-3 w-3 shrink-0 rounded-full border border-white/20 border-t-[var(--accent-lime)] animate-spin" />
          )}
          <span className="min-w-0 flex-1 truncate font-sans">
            {t.label}
            {t.status === "done" ? " — done" : t.status === "error" ? " — failed" : ""}
            {t.detail ? ` · ${t.detail}` : ""}
          </span>
          {t.status !== "running" && (
            <button
              type="button"
              onClick={() => setDismissed((d) => ({ ...d, [t.id]: true }))}
              className="shrink-0 cursor-pointer bg-transparent p-0 text-muted-foreground hover:text-white"
            >
              Dismiss
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
