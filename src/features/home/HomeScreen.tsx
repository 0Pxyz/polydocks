import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MiniOrb } from "@/components/icons/MiniOrb";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

export const PRODUCT_HEADLINE =
  "Your agentic workspace. Ask the agent to do real work — it uses the tools in your dock, and installs new ones when needed.";

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
}

export interface HomeScreenProps {
  onSendMessage: (prompt: string, meta?: { origin?: string }) => void;
  onEnterCity?: (cityName: string) => void;
  onOpenPlugin?: (pluginId: string) => void;
  onOpenStore?: () => void;
  installedPlugins?: HomePluginEntry[];
  recentCities?: { id: string; title: string }[];
  className?: string;
}

const FIRST_RUN_HINTS = [
  "Ask anything — research, building, writing, automation.",
  "Your dock holds your tools — click one to open it.",
  "Polymax lives here too — knowledge worlds, one plugin among many.",
];

export function HomeScreen({
  onSendMessage,
  onEnterCity,
  onOpenPlugin,
  onOpenStore,
  installedPlugins = [],
  recentCities = [],
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
  const visibleCities = (recentCities || []).slice(0, 2);
  const isFirstRun = visiblePlugins.length === 0 && visibleCities.length === 0;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center max-w-xl w-full px-4 pt-6 sm:pt-10 pb-6 my-auto select-none",
        className
      )}
    >
      {/* Staggered entrance */}
      <motion.div
        initial={{ opacity: 0, y: isReduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex flex-col items-center w-full"
      >
        {/* Wordmark: Polydocks ~48px, weight 600 */}
        <h1 className="text-4xl sm:text-5xl font-semibold text-white tracking-normal mb-3">
          Polydocks
        </h1>

        {/* Product line: Constant headline, no italics, quiet text */}
        <p className="text-[15px] text-[#9aa5b8] max-w-md font-sans mb-8">
          {PRODUCT_HEADLINE}
        </p>

        {/* Single frameless wide input */}
        <form
          onSubmit={handleSubmit}
          className="relative w-full max-w-[560px] flex items-center bg-[#0c0e14]/80 backdrop-blur-xl rounded-2xl px-4 py-3 shadow-2xl focus-within:ring-1 focus-within:ring-[var(--accent-lime)]/40 transition-shadow"
        >
          <div className="relative flex-1 flex items-center min-w-0">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full bg-transparent text-[15px] text-white outline-none placeholder-transparent z-10"
              aria-label="Ask your agent what to do"
            />

            {/* Cross-fading rotating placeholder */}
            {!value && (
              <div className="absolute inset-0 flex items-center pointer-events-none overflow-hidden text-[15px] text-[#9aa5b8]/70">
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

          {/* MiniOrb Voice & Send Trigger */}
          <button
            type="button"
            onClick={() => handleSubmit()}
            className="ml-2.5 p-1 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform"
            aria-label="Ask Agent"
          >
            <MiniOrb state="idle" size={22} />
          </button>
        </form>

        {/* Installed plugins: dynamic, from the workspace plugin registry */}
        {visiblePlugins.length > 0 && (
          <div className="mt-6 flex flex-col items-center gap-2 w-full">
            <span className="text-[11px] uppercase tracking-widest text-[#545f75]">
              In your dock
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-[560px]">
              {visiblePlugins.map((plugin) => (
                <button
                  key={plugin.id}
                  type="button"
                  onClick={() => onOpenPlugin?.(plugin.id)}
                  title={plugin.detail || plugin.label}
                  className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs text-[#9aa5b8] hover:text-white hover:border-white/25 transition-colors cursor-pointer"
                >
                  {plugin.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onOpenStore?.()}
                className="px-3 py-1.5 rounded-full text-xs text-[var(--accent-lime)] hover:opacity-80 transition-opacity cursor-pointer"
              >
                + Discover
              </button>
            </div>
          </div>
        )}

        {/* Minimal recent work: real context only, never a metrics dashboard */}
        {visibleCities.length > 0 && (
          <div className="mt-5 flex flex-col items-center gap-1.5 w-full">
            {visibleCities.map((city) => (
              <button
                key={city.id}
                type="button"
                onClick={() => onEnterCity?.(city.title)}
                className="text-xs text-[#9aa5b8] hover:text-white transition-colors cursor-pointer py-1"
              >
                Continue {city.title}
              </button>
            ))}
          </div>
        )}

        {/* First-launch: the interface itself explains agent + dock + plugins */}
        {isFirstRun && (
          <div className="mt-6 flex flex-col items-center gap-1.5 w-full">
            {FIRST_RUN_HINTS.map((hint) => (
              <p key={hint} className="text-xs text-[#545f75]">
                {hint}
              </p>
            ))}
            <button
              type="button"
              onClick={() => onOpenStore?.()}
              className="mt-1 text-xs text-[var(--accent-lime)] hover:opacity-80 transition-opacity cursor-pointer"
            >
              Browse plugins
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
