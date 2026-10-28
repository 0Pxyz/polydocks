import { useState, useRef, useEffect } from "react";
import {
  Compass,
  Cards,
  Paperclip,
  Globe,
  NotePencil,
  Target,
  Palette,
  TerminalWindow,
  Flame,
  Sparkle,
} from "@phosphor-icons/react";
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

export const DOCK_TOOLS: DockToolItem[] = [
  {
    id: "agent",
    label: "Agent Co-Pilot (⌘K)",
    type: "icon",
    icon: Sparkle,
    isAgent: true,
  },
  {
    id: "terminal",
    label: "City Terminal",
    type: "icon",
    icon: TerminalWindow,
    text: ">_",
  },
  {
    id: "flashcards",
    label: "Flashcards & Drills",
    type: "icon",
    icon: Cards,
  },
  {
    id: "sources",
    label: "Sources (TinyFish)",
    type: "icon",
    icon: Paperclip,
  },
  {
    id: "world",
    label: "World Map (Cities)",
    type: "icon",
    icon: Compass,
  },
  {
    id: "browser",
    label: "Web Browser",
    type: "icon",
    icon: Globe,
  },
  {
    id: "notes",
    label: "Notes & Tiling",
    type: "icon",
    icon: NotePencil,
    text: "Aa",
  },
  {
    id: "quests",
    label: "Quests & Practice",
    type: "icon",
    icon: Target,
  },
  {
    id: "theme",
    label: "Theme & Wallpaper",
    type: "icon",
    icon: Palette,
  },
];

interface AgenticDockProps {
  activeToolId?: string;
  onSelectTool?: (toolId: string) => void;
  className?: string;
  isAgentWorking?: boolean;
  isAgentSheetOpen?: boolean;
  extraTools?: DockToolItem[];
}

export function AgenticDock({
  activeToolId: controlledActiveToolId,
  onSelectTool,
  className,
  isAgentWorking = false,
  isAgentSheetOpen = false,
  extraTools = [],
}: AgenticDockProps) {
  const headerRef = useRef<HTMLElement>(null);
  const [internalActiveToolId, setInternalActiveToolId] = useState<string>("");
  const activeToolId = controlledActiveToolId ?? internalActiveToolId;

  // Global ⌘K shortcut for agent conversation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onSelectTool?.("agent");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelectTool]);

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
    const nextToolId = activeToolId === toolId ? "" : toolId;
    if (controlledActiveToolId === undefined) {
      setInternalActiveToolId(nextToolId);
    }
    onSelectTool?.(nextToolId);
  };

  const allTools = [...DOCK_TOOLS, ...extraTools];

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
        <div className="bg-[#0d1118]/95 border border-border/80 rounded-[14px] p-1.5 flex items-center gap-1.5 shadow-[0_14px_35px_rgba(0,0,0,0.7),inset_0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200">
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
        </div>
      </div>
    </header>
  );
}
