import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { TINYFISH_LOGO_SRC, isTinyFishTool } from "@/lib/agent/events";
import {
  pushLine,
  riseDurationMs,
  jobOpacity,
  subscribeThoughts,
  subscribeJobs,
  type ThoughtLine,
} from "@/lib/agent/thoughtStream";

/**
 * Living-agent stream: short status lines rise from the orb and fade out
 * at the top. No bubbles, no box, no history — lines leaving the viewport
 * are pruned from state (and the DOM). Theme tokens only; opacity falls
 * as lines rise. Reduced motion: latest line fades, nothing moves.
 */
export function useThoughtStream(): ThoughtLine[] {
  const [lines, setLines] = useState<ThoughtLine[]>([]);
  useEffect(() => subscribeThoughts((line) => setLines((prev) => pushLine(prev, line))), []);
  return lines;
}

export function useActiveJobs(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => subscribeJobs(setIds), []);
  return ids;
}

export function ThoughtStream({ className = "" }: { className?: string }) {
  const lines = useThoughtStream();
  const reduced = prefersReducedMotion();
  const visible = reduced ? lines.slice(-1) : lines;
  const duration = riseDurationMs(lines.length);

  // The space is always reserved so lines have somewhere to rise into;
  // empty when idle (orb + hint own the resting state).

  return (
    <div
      className={cn("pointer-events-none flex w-full max-w-md flex-col justify-end overflow-hidden", className)}
      style={{
        height: 88,
        maskImage: "linear-gradient(to bottom, transparent, black 40%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black 40%)",
        perspective: 320,
      }}
      aria-live="polite"
      aria-label="Agent activity"
    >
      <style>{THOUGHT_STREAM_CSS}</style>
      {visible.map((line, i) => (
        <div
          key={line.id}
          className="thought-line text-center"
          style={{
            opacity: reduced ? 1 : Math.max(0.35, 1 - (visible.length - 1 - i) * 0.22) * jobOpacity(line.jobId),
            animationDuration: `${duration}ms`,
            transform: reduced ? undefined : "rotateX(8deg)",
          }}
          data-thought-line={line.id}
        >
          {/* Blurred chip: readable over any wallpaper or theme, no box —
            just enough backdrop to lift the text off the background.
            Same TinyFish mark the chat uses, when a discovery tool speaks. */}
        <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-black/30 px-3 font-sans text-[13px] leading-[22px] text-white backdrop-blur-md [text-shadow:0_1px_8px_rgba(0,0,0,0.65)]">
          {line.tool && isTinyFishTool(line.tool) && (
            <img
              src={TINYFISH_LOGO_SRC}
              alt="TinyFish"
              width={14}
              height={14}
              className="h-3.5 w-3.5 shrink-0 rounded-full object-cover"
            />
          )}
          <span className="truncate">{line.text}</span>
        </span>
        </div>
      ))}
    </div>
  );
}

const THOUGHT_STREAM_CSS = `
.thought-line {
  animation-name: thought-rise;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
  will-change: transform, opacity;
}
@keyframes thought-rise {
  0% { transform: translateY(14px) rotateX(8deg); opacity: 0; }
  12% { opacity: 1; }
  75% { opacity: 1; }
  100% { transform: translateY(-58px) rotateX(8deg); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .thought-line { animation: thought-fade 1.2s ease forwards; transform: none; }
  @keyframes thought-fade {
    0% { opacity: 0; }
    20% { opacity: 1; }
    80% { opacity: 1; }
    100% { opacity: 0; }
  }
}
`;
