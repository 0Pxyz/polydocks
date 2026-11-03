import { motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useReducedMotion } from "@/lib/motion";

/**
 * Shared assistant markdown: links, fenced code blocks with copy, inline
 * code. Used for finished replies and the streaming reveal alike so both
 * render identically (no separate code path per state).
 */
export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }) => <>{children}</>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-lime)] hover:underline underline-offset-4"
          >
            {children}
          </a>
        ),
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match && !String(children).includes("\n");
          if (isInline) {
            return (
              <code
                className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-xs text-[var(--accent-lime)]"
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <div className="relative my-3 rounded-xl bg-black/60 border border-white/10 overflow-hidden font-mono text-xs">
              <div className="flex items-center justify-between px-3.5 py-1.5 bg-white/5 border-b border-white/5 text-muted-foreground text-[11px]">
                <span>{match?.[1] || "code"}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(String(children).replace(/\n$/, ""))}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Copy
                </button>
              </div>
              <pre className="p-3.5 overflow-x-auto text-[#e2e8f0]">
                <code>{children}</code>
              </pre>
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/**
 * Progressive response reveal. Content already arrives incrementally from
 * the parent; this renders it as markdown with a live caret while
 * streaming. Only a brand-new trailing block fades in (keyed by block
 * count), so the growing tail never remounts or flickers. Reduced-motion
 * users get the caret state change with no animation.
 */
export function StreamingText({ text, streaming }: { text: string; streaming: boolean }) {
  const reduceMotion = useReducedMotion();
  const blocks = text.split(/\n{2,}/);
  const head = blocks.slice(0, -1).join("\n\n");
  const tail = blocks[blocks.length - 1] ?? "";

  return (
    <div aria-live="polite" className="w-full leading-relaxed text-[15px] text-foreground/90 font-sans">
      {head ? (
        <div className="whitespace-pre-wrap pb-1">
          <AssistantMarkdown content={head} />
        </div>
      ) : null}
      {reduceMotion ? (
        <div className="whitespace-pre-wrap pb-1">
          <AssistantMarkdown content={tail} />
        </div>
      ) : (
        <motion.div
          key={blocks.length}
          initial={{ opacity: 0.35 }}
          animate={{ opacity: 1, transition: { duration: 0.25, ease: "easeOut" } }}
          className="whitespace-pre-wrap pb-1"
        >
          <AssistantMarkdown content={tail} />
        </motion.div>
      )}
      {streaming ? (
        <span
          aria-hidden
          className="inline-block w-[7px] h-[18px] -mb-[3px] rounded-[2px] bg-[var(--accent-lime)] animate-pulse"
        />
      ) : null}
    </div>
  );
}
