import { useState } from "react";
import { Check, X } from "lucide-react";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { TINYFISH_LOGO_SRC } from "@/lib/agent/events";
import type { AgentStep } from "@/lib/agent/conversationStore";

/**
 * Thinking + steps timeline for one assistant message (or job card).
 * Consumes durable SSE-derived steps: friendly labels only, never
 * technical tool ids. Theme-adaptive (accent token glow, radius from
 * tokens); honors prefers-reduced-motion (no pulse, static marks).
 */
export function StepsTimeline({
  steps,
  thinking,
  defaultOpen = true,
}: {
  steps: AgentStep[];
  thinking?: string;
  defaultOpen?: boolean;
}) {
  const reduceMotion = prefersReducedMotion();
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(!defaultOpen);
  if ((!steps || steps.length === 0) && !thinking) return null;
  const running = steps.some((s) => s.status === "running");

  return (
    <div className="mb-2" data-testid="steps-timeline" aria-live="polite">
      <style>{STEPS_TIMELINE_CSS}</style>
      {thinking && thinking.trim() && (
        <div className="mb-1">
          <button
            type="button"
            onClick={() => setThinkingOpen((v) => !v)}
            className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-expanded={thinkingOpen}
          >
            {thinkingOpen ? "Hide thinking" : "Show thinking"}
          </button>
          {thinkingOpen && (
            <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground/80 border-l-2 border-white/10 pl-2">
              {thinking}
            </div>
          )}
        </div>
      )}
      {steps.length > 0 && (
        <div>
          {steps.length > 3 && (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer mb-1"
              aria-expanded={!collapsed}
            >
              {collapsed ? `Show ${steps.length} steps` : "Hide steps"}
            </button>
          )}
          {!collapsed && (
            <ol className="flex flex-col gap-1">
              {steps.map((step) => {
                const branded = step.label.includes("TinyFish");
                return (
                  <li
                    key={step.id}
                    className="flex items-center gap-2 text-xs font-mono text-muted-foreground"
                    data-step-status={step.status}
                  >
                    {branded ? (
                      <img
                        src={TINYFISH_LOGO_SRC}
                        alt="TinyFish"
                        width={14}
                        height={14}
                        className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                      />
                    ) : step.status === "running" ? (
                      <span
                        className={cn(
                          "step-glow text-[10px] leading-none",
                          !reduceMotion && "step-pulse inline-block"
                        )}
                        aria-label="running"
                      >
                        ✦
                      </span>
                    ) : step.status === "done" ? (
                      <Check className="w-3 h-3 text-[var(--accent-lime)] shrink-0" aria-label="done" />
                    ) : (
                      <X className="w-3 h-3 text-red-400 shrink-0" aria-label="failed" />
                    )}
                    <span className="truncate">{step.label}</span>
                    {step.status === "running" && running && (
                      <span className="text-muted-foreground/60 shrink-0">…</span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

const STEPS_TIMELINE_CSS = `
.step-glow { color: var(--accent-lime); text-shadow: 0 0 8px var(--accent-lime); }
@media (prefers-reduced-motion: reduce) {
  .step-pulse { animation: none; }
}
@media (prefers-reduced-motion: no-preference) {
  .step-pulse { animation: step-soft-pulse 1.6s ease-in-out infinite; }
  @keyframes step-soft-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
}
`;
