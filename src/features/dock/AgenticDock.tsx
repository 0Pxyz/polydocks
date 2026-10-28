import { useState, useRef, useEffect } from "react";
import {
  Compass,
  Globe,
  NotePencil,
  Target,
  TerminalWindow,
  Flame,
  Sparkle,
  Sliders,
  Folder,
  ArrowLeft,
  Plus,
  Lightning,
  FilePlus,
  Cards,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { DockIcon } from "@/components/icons/DockIcon";
import type { IconComponent } from "@/components/icons/adapter";

export interface DockToolItem {
  id: string;
  label: string;
  type: "icon" | "text" | "terminal";
  icon?: IconComponent | React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  text?: string;
  isAgent?: boolean;
}

export const ROOT_DOCK_TOOLS: DockToolItem[] = [
  {
    id: "agent",
    label: "Agent Co-Pilot (⌘K)",
    type: "icon",
    icon: Sparkle,
    isAgent: true,
  },
  {
    id: "maps",
    label: "World Map (Atlas)",
    type: "icon",
    icon: Compass,
  },
  {
    id: "settings",
    label: "Settings & Themes",
    type: "icon",
    icon: Sliders,
  },
];

export const CITY_DOCK_TOOLS: DockToolItem[] = [
  {
    id: "world",
    label: "Back to World Map",
    type: "icon",
    icon: ArrowLeft,
  },
  {
    id: "agent",
    label: "City Agent (⌘K)",
    type: "icon",
    icon: Sparkle,
    isAgent: true,
  },
  {
    id: "browser",
    label: "Research & Sources",
    type: "icon",
    icon: Globe,
  },
  {
    id: "files",
    label: "City Files",
    type: "icon",
    icon: Folder,
  },
  {
    id: "notes",
    label: "Notes & Syntheses",
    type: "icon",
    icon: NotePencil,
  },
  {
    id: "quests",
    label: "Quests & Practice",
    type: "icon",
    icon: Target,
  },
  {
    id: "terminal",
    label: "City Terminal",
    type: "icon",
    icon: TerminalWindow,
  },
];

// Preserved for backward compatibility
export const DOCK_TOOLS: DockToolItem[] = ROOT_DOCK_TOOLS;

interface AgenticDockProps {
  mode?: "world" | "city";
  activeToolId?: string;
  onSelectTool?: (toolId: string) => void;
  className?: string;
  isAgentWorking?: boolean;
  isAgentSheetOpen?: boolean;
  extraTools?: DockToolItem[];
  tools?: DockToolItem[];
  onAddAction?: (action: "synthesize_tool" | "create_file" | "create_note" | "add_flashcards") => void;
}

export function AgenticDock({
  mode = "world",
  activeToolId: controlledActiveToolId,
  onSelectTool,
  className,
  isAgentWorking = false,
  isAgentSheetOpen = false,
  extraTools = [],
  tools: explicitTools,
  onAddAction,
}: AgenticDockProps) {
  const headerRef = useRef<HTMLElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const [internalActiveToolId, setInternalActiveToolId] = useState<string>("");
  const [showPlusMenu, setShowPlusMenu] = useState<boolean>(false);
  const activeToolId = controlledActiveToolId ?? internalActiveToolId;

  // Global ⌘K shortcut for agent conversation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onSelectTool?.("agent");
      }
      if (e.key === "Escape") {
        setShowPlusMenu(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelectTool]);

  // Click outside to close plus menu
  useEffect(() => {
    if (!showPlusMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPlusMenu]);

  // Measure dock bottom edge dynamically and publish --dock-bottom to :root
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const updateDockBottom = () => {
      const rect = el.getBoundingClientRect();
      const bottom = Math.round(rect.bottom);
      document.documentElement.style.setProperty("--dock-bottom", `${bottom}px`);
    };

    updateDockBottom();

    const ro = new ResizeObserver(() => {
      updateDockBottom();
    });
    ro.observe(el);

    window.addEventListener("resize", updateDockBottom);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateDockBottom);
    };
  }, []);

  const handleToolClick = (toolId: string) => {
    setShowPlusMenu(false);
    const nextToolId = activeToolId === toolId ? "" : toolId;
    if (controlledActiveToolId === undefined) {
      setInternalActiveToolId(nextToolId);
    }
    onSelectTool?.(nextToolId);
  };

  const baseTools = explicitTools ?? (mode === "city" ? CITY_DOCK_TOOLS : ROOT_DOCK_TOOLS);
  const allTools = [...baseTools, ...extraTools];

  return (
    <header
      ref={headerRef}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 flex flex-col items-center select-none pt-0 pointer-events-none",
        className
      )}
    >
      {/* Top Glowing Neon Edge Line across the top of the viewport */}
      <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--accent-lime)] to-transparent opacity-85 shadow-[0_0_12px_rgba(200,255,87,0.6)]" />

      {/* Top HUD container */}
      <div className="flex flex-col items-center pt-2.5 pb-2 pointer-events-auto">
        {/* Status Bar */}
        <div className="flex items-center justify-center gap-4 px-4 py-1 font-mono text-[13px] font-semibold tracking-wide mb-2">
          {/* Level */}
          <div className="flex items-center gap-1.5 text-[var(--accent-lime)] drop-shadow-[0_0_8px_rgba(200,255,87,0.4)]">
            <span className="text-[14px] leading-none">✦</span>
            <span>Lvl 4</span>
          </div>

          <span className="text-border/80 font-light select-none">|</span>

          {/* XP Progress Group */}
          <div className="flex items-center gap-2">
            <div className="w-[68px] h-2 bg-[#1b2029] rounded-full overflow-hidden p-[1px] flex items-center border border-white/5">
              <div
                className="h-full w-[20%] bg-[var(--accent-lime)] rounded-full shadow-[0_0_8px_rgba(200,255,87,0.7)] transition-all duration-300"
                style={{ width: "20%" }}
              />
            </div>
            <span className="text-xs text-[#d1d6e2] font-mono">20%</span>
          </div>

          <span className="text-border/80 font-light select-none">|</span>

          {/* Streak with Phosphor Duotone Flame */}
          <div className="flex items-center gap-1 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.35)]">
            <Flame size={16} weight="duotone" className="text-amber-500" />
            <span>4d</span>
          </div>
        </div>

        {/* Floating Dock Capsule */}
        <div className="relative bg-[#0d1118]/95 border border-border/80 rounded-[14px] p-1.5 flex items-center gap-1.5 shadow-[0_14px_35px_rgba(0,0,0,0.7),inset_0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200">
          {allTools.map((tool) => {
            const isAgent = tool.isAgent;
            const isActive = isAgent
              ? activeToolId === tool.id || isAgentSheetOpen
              : activeToolId === tool.id;

            return (
              <button
                key={tool.id}
                type="button"
                data-dock-tool-id={tool.id}
                onClick={() => handleToolClick(tool.id)}
                className={cn(
                  "group relative w-10 h-10 min-w-[40px] flex items-center justify-center rounded-[10px] transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-lime)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1118]",
                  !isActive &&
                    "text-[#9aa5b8] hover:text-white hover:bg-white/[0.08] hover:-translate-y-0.5",
                  isActive &&
                    "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] border border-[var(--accent-lime)]/40 shadow-[0_0_12px_rgba(200,255,87,0.25)]",
                  !isActive &&
                    isAgent &&
                    isAgentWorking &&
                    "text-[var(--accent-lime)] shadow-[0_0_12px_rgba(200,255,87,0.4)]"
                )}
                aria-label={tool.label}
              >
                <DockIcon
                  icon={tool.icon}
                  name={tool.id}
                  isActive={isActive}
                  isAgent={isAgent}
                  isAgentWorking={isAgentWorking}
                  size={21}
                />

                {/* Tooltip */}
                <span className="pointer-events-none absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-all duration-150 transform translate-y-1 group-hover:translate-y-0 bg-[#171b24] border border-[#2e374d] text-[#f1f3f9] text-[11px] font-mono px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50">
                  {tool.label}
                </span>
              </button>
            );
          })}

          {/* In City Mode: Plus (+) button to add tools to dock or synthesize with agent */}
          {mode === "city" && (
            <div ref={plusMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowPlusMenu((prev) => !prev)}
                className={cn(
                  "group relative w-10 h-10 min-w-[40px] flex items-center justify-center rounded-[10px] border border-dashed border-white/20 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/40 transition-all duration-150 cursor-pointer text-[#9aa5b8] hover:text-white focus:outline-none",
                  showPlusMenu && "border-[var(--accent-lime)] text-[var(--accent-lime)] bg-[var(--accent-lime)]/10"
                )}
                aria-label="Add to Dock"
              >
                <Plus size={18} weight="bold" />
                <span className="pointer-events-none absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-all duration-150 transform translate-y-1 group-hover:translate-y-0 bg-[#171b24] border border-[#2e374d] text-[#f1f3f9] text-[11px] font-mono px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50">
                  Add to Dock
                </span>
              </button>

              {/* Plus Popover */}
              <AnimatePresence>
                {showPlusMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-12 right-0 w-64 rounded-xl bg-[#0f141f] border border-white/10 shadow-2xl p-2 z-50 text-xs backdrop-blur-xl"
                  >
                    <div className="px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-[#9aa5b8]">
                      Mount to City Dock
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowPlusMenu(false);
                        onAddAction?.("synthesize_tool");
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[#d1d6e2] hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                    >
                      <Lightning size={16} weight="duotone" className="text-[var(--accent-lime)]" />
                      <div>
                        <div className="font-semibold text-white">Synthesize with Agent</div>
                        <div className="text-[10px] text-[#9aa5b8]">Build flashcards, quiz, comparator</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowPlusMenu(false);
                        onAddAction?.("create_file");
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[#d1d6e2] hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                    >
                      <FilePlus size={16} weight="duotone" className="text-[#38bdf8]" />
                      <div>
                        <div className="font-semibold text-white">Create Workspace File</div>
                        <div className="text-[10px] text-[#9aa5b8]">Add script, markdown, or dataset</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowPlusMenu(false);
                        onAddAction?.("create_note");
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[#d1d6e2] hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                    >
                      <NotePencil size={16} weight="duotone" className="text-amber-400" />
                      <div>
                        <div className="font-semibold text-white">New Synthesized Note</div>
                        <div className="text-[10px] text-[#9aa5b8]">Open markdown note editor</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowPlusMenu(false);
                        onAddAction?.("add_flashcards");
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[#d1d6e2] hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                    >
                      <Cards size={16} weight="duotone" className="text-purple-400" />
                      <div>
                        <div className="font-semibold text-white">Mount Flashcards Tool</div>
                        <div className="text-[10px] text-[#9aa5b8]">Interactive recall drills</div>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
