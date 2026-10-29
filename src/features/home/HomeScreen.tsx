import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MiniOrb } from "@/components/icons/MiniOrb";
import { resolveIcon } from "@/components/icons/adapter";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

const ROTATING_EXAMPLES = [
  "Research the latest on small modular reactors",
  "Build a tracker for my reading list",
  "Organize my sources on urbanism",
  "Summarize this workspace",
];

export interface HomePluginEntry {
  id: string;
  label: string;
  detail?: string;
  iconKey?: string;
}

export interface HomeScreenProps {
  onSendMessage: (prompt: string, meta?: { origin?: string }) => void;
  onOpenPlugin?: (pluginId: string) => void;
  onOpenStore?: () => void;
  installedPlugins?: HomePluginEntry[];
  className?: string;
}

export function HomeScreen({
  onSendMessage,
  onOpenPlugin,
  onOpenStore,
  installedPlugins = [],
  className = "",
}: HomeScreenProps) {
  const [value, setValue] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isReduced = prefersReducedMotion();

  // Rotate examples every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setExampleIndex((prev) => (prev + 1) % ROTATING_EXAMPLES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Global '/' shortcut to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = value.trim() || ROTATING_EXAMPLES[exampleIndex];
    if (!query) return;
    onSendMessage(query, { origin: "home" });
    setValue("");
  };

  const visiblePlugins = (installedPlugins || []).slice(0, 6);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center max-w-xl w-full px-4 pt-6 sm:pt-10 pb-6 my-auto select-none",
        className
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: isReduced ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col items-center w-full"
      >
        {/* Agent presence: a quiet breathing orb, the focal point */}
        <motion.div
          animate={isReduced ? undefined : { opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="relative mb-7"
          aria-hidden="true"
        >
          <div className="absolute inset-0 -m-5 rounded-full bg-[radial-gradient(circle,rgba(200,255,87,0.12)_0%,transparent_70%)]" />
          <MiniOrb state="idle" size={44} />
        </motion.div>

        {/* Central prompt: the primary interaction */}
        <form
          onSubmit={handleSubmit}
          className="relative w-full max-w-[560px] flex items-center bg-[#0c0e14]/80 backdrop-blur-xl rounded-2xl px-5 py-4 shadow-2xl focus-within:ring-1 focus-within:ring-[var(--accent-lime)]/40 transition-shadow"
        >
          <div className="relative flex-1 flex items-center min-w-0">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full bg-transparent text-base text-white outline-none placeholder-transparent z-10"
              aria-label="Ask your agent what to do"
            />

            {/* Cross-fading rotating placeholder */}
            {!value && (
              <div className="absolute inset-0 flex items-center pointer-events-none overflow-hidden text-base text-[#9aa5b8]/70">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={exampleIndex}
                    initial={{ opacity: 0, y: isReduced ? 0 : 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: isReduced ? 0 : -4 }}
                    transition={{ duration: 0.25 }}
                    className="truncate text-left"
                  >
                    {ROTATING_EXAMPLES[exampleIndex]}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleSubmit()}
            className="ml-3 p-1 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform"
            aria-label="Ask Agent"
          >
            <MiniOrb state="idle" size={22} />
          </button>
        </form>

        {/* Your plugins: installed tools as first-class experiences */}
        <div className="mt-12 w-full max-w-[560px]">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[11px] uppercase tracking-widest text-[#545f75]">
              Your plugins
            </span>
            <button
              type="button"
              onClick={() => onOpenStore?.()}
              className="text-xs text-[var(--accent-lime)] hover:opacity-80 transition-opacity cursor-pointer"
            >
              Discover
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {visiblePlugins.map((plugin, index) => {
              const Icon = resolveIcon(plugin.iconKey || plugin.id);
              return (
                <motion.button
                  key={plugin.id}
                  type="button"
                  initial={{ opacity: 0, y: isReduced ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
                  onClick={() => onOpenPlugin?.(plugin.id)}
                  title={plugin.detail || plugin.label}
                  className="group flex flex-col items-center gap-2.5 px-2 py-5 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.05] hover:border-[var(--accent-lime)]/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-lime)]"
                >
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.06] text-white/80 group-hover:text-[var(--accent-lime)] transition-colors">
                    <Icon size={20} weight="duotone" />
                  </span>
                  <span className="text-xs text-[#9aa5b8] group-hover:text-white transition-colors truncate max-w-full">
                    {plugin.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
