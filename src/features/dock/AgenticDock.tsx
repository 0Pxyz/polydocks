import { useState, useRef, useEffect } from "react";
import {
  Compass,
  Globe,
  NotePencil,
  Sparkle,
  Plus,
  Lightning,
  FilePlus,
  Cards,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { DockIcon } from "@/components/icons/DockIcon";
import { spring } from "@/lib/motion";
import type { IconComponent } from "@/components/icons/adapter";

export interface DockToolItem {
  id: string;
  label: string;
  type: "icon" | "text" | "terminal";
  icon?: IconComponent | React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  text?: string;
  isAgent?: boolean;
}

export const CORE_DOCK_TOOLS: DockToolItem[] = [
  {
    id: "agent",
    label: "Agent (⌘K)",
    type: "icon",
    icon: Sparkle,
    isAgent: true,
  },
  {
    id: "maps",
    label: "World Map",
    type: "icon",
    icon: Compass,
  },
  {
    id: "browser",
    label: "Research & Sources",
    type: "icon",
    icon: Globe,
  },
  {
    id: "notes",
    label: "Notes",
    type: "icon",
    icon: NotePencil,
  },
];

export const ROOT_DOCK_TOOLS: DockToolItem[] = CORE_DOCK_TOOLS;
export const CITY_DOCK_TOOLS: DockToolItem[] = CORE_DOCK_TOOLS;
export const DOCK_TOOLS: DockToolItem[] = CORE_DOCK_TOOLS;

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

  const baseTools = explicitTools ?? CORE_DOCK_TOOLS;
  const allTools = [...baseTools, ...extraTools];

  return (
    <header
      ref={headerRef}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 flex flex-col items-center select-none pt-3 pointer-events-none",
        className
      )}
    >
      {/* Floating Agentic Dock Capsule - Smoothly expands when agent creates tools */}
      <motion.div
        layout
        transition={spring.soft}
        className="pointer-events-auto relative bg-[#0c0e14]/95 border border-white/10 rounded-2xl p-1.5 flex items-center gap-1.5 shadow-2xl backdrop-blur-xl"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {allTools.map((tool) => {
            const isAgent = tool.isAgent;
            const isActive = isAgent
              ? activeToolId === tool.id || isAgentSheetOpen
              : activeToolId === tool.id;

            return (
              <motion.button
                layout
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={spring.soft}
                key={tool.id}
                type="button"
                data-dock-tool-id={tool.id}
                onClick={() => handleToolClick(tool.id)}
                className={cn(
                  "group relative w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl transition-colors duration-150 cursor-pointer focus:outline-none",
                  !isActive && "text-[#9aa5b8] hover:text-white hover:bg-white/[0.08]",
                  isActive &&
                    "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] border border-[var(--accent-lime)]/30 shadow-[0_0_12px_rgba(200,255,87,0.2)]",
                  !isActive &&
                    isAgent &&
                    isAgentWorking &&
                    "text-[var(--accent-lime)] shadow-[0_0_12px_rgba(200,255,87,0.3)]"
                )}
                aria-label={tool.label}
              >
                <DockIcon
                  icon={tool.icon}
                  name={tool.id}
                  isActive={isActive}
                  isAgent={isAgent}
                  isAgentWorking={isAgentWorking}
                  size={20}
                />

                {/* Tooltip */}
                <span className="pointer-events-none absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-[#171b24] text-[#f1f3f9] text-[11px] font-sans px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50">
                  {tool.label}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>

        {/* Dynamic Tool Synthesizer Button */}
        <div ref={plusMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setShowPlusMenu((prev) => !prev)}
            className={cn(
              "group relative w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/[0.02] hover:bg-white/[0.08] hover:border-white/40 transition-colors cursor-pointer text-[#9aa5b8] hover:text-white focus:outline-none",
              showPlusMenu && "border-[var(--accent-lime)] text-[var(--accent-lime)] bg-[var(--accent-lime)]/10"
            )}
            aria-label="Synthesize Tool"
            title="Synthesize New Tool"
          >
            <Plus size={16} weight="bold" />
            <span className="pointer-events-none absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-[#171b24] text-[#f1f3f9] text-[11px] font-sans px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50">
              Synthesize Tool
            </span>
          </button>

          {/* Synthesizer Popover */}
          <AnimatePresence>
            {showPlusMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 6 }}
                transition={{ duration: 0.15 }}
                className="absolute top-12 right-0 w-64 rounded-xl bg-[#0f141f] border border-white/10 shadow-2xl p-2 z-50 text-xs backdrop-blur-xl"
              >
                <div className="px-2 py-1 text-[11px] font-mono text-[#9aa5b8]">
                  Synthesize Dynamic Tool
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowPlusMenu(false);
                    onAddAction?.("add_flashcards");
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[#d1d6e2] hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                >
                  <Cards size={16} className="text-[var(--accent-lime)]" />
                  <div>
                    <div className="font-medium text-white">Synthesize Flashcards</div>
                    <div className="text-[10px] text-[#9aa5b8]">Expands dock with practice tool</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowPlusMenu(false);
                    onAddAction?.("synthesize_tool");
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[#d1d6e2] hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                >
                  <Lightning size={16} className="text-[var(--accent-lime)]" />
                  <div>
                    <div className="font-medium text-white">Ask Agent to Build Tool</div>
                    <div className="text-[10px] text-[#9aa5b8]">Generate custom dynamic tab</div>
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
                  <NotePencil size={16} className="text-[#9aa5b8]" />
                  <div>
                    <div className="font-medium text-white">New Note</div>
                    <div className="text-[10px] text-[#9aa5b8]">Open markdown synthesis</div>
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
                  <FilePlus size={16} className="text-[#9aa5b8]" />
                  <div>
                    <div className="font-medium text-white">Create File</div>
                    <div className="text-[10px] text-[#9aa5b8]">Add script or document</div>
                  </div>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </header>
  );
}
