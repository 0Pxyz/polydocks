import { useState, useRef, useEffect } from "react";
import {
  Compass,
  Globe,
  NotePencil,
  Sparkle,
  Plus,
  Storefront,
  Sliders,
  Folder,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { DockIcon } from "@/components/icons/DockIcon";
import { spring, prefersReducedMotion } from "@/lib/motion";
import type { IconComponent } from "@/components/icons/adapter";
import { useThemeStore } from "@/lib/theme";
import { DOCK_STYLES } from "./styles";
import { DockStatusLine } from "@/features/profile/DockStatusLine";

export * from "./legacyAdapter";
export * from "./surfaceResolver";

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

export const STORE_DOCK_TOOL: DockToolItem = {
  id: "store",
  label: "Plugin Store",
  type: "icon",
  icon: Storefront,
};

export const ROOT_DOCK_TOOLS: DockToolItem[] = CORE_DOCK_TOOLS;

export const HOME_DOCK_TOOLS: DockToolItem[] = [
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
    id: "settings",
    label: "Settings",
    type: "icon",
    icon: Sliders,
  },
];

export const CITY_DOCK_TOOLS: DockToolItem[] = [
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
  {
    id: "files",
    label: "City Files",
    type: "icon",
    icon: Folder,
  },
  {
    id: "settings",
    label: "Settings",
    type: "icon",
    icon: Sliders,
  },
];

export const DOCK_TOOLS: DockToolItem[] = ROOT_DOCK_TOOLS;

interface AgenticDockProps {
  mode?: "world" | "city";
  cityName?: string;
  activeToolId?: string;
  onSelectTool?: (toolId: string) => void;
  className?: string;
  isAgentWorking?: boolean;
  isAgentSheetOpen?: boolean;
  extraTools?: DockToolItem[];
  tools?: DockToolItem[];
  onSubmitToolPrompt?: (prompt: string) => void;
  isBuilding?: boolean;
  buildingName?: string;
  statusText?: string;
  onStopBuilding?: () => void;
  onRetryBuilding?: () => void;
}

export function AgenticDock({
  cityName,
  activeToolId: controlledActiveToolId,
  onSelectTool,
  className,
  isAgentWorking = false,
  isAgentSheetOpen = false,
  extraTools = [],
  tools: explicitTools,
  onSubmitToolPrompt,
  isBuilding = false,
  buildingName,
  statusText,
  onStopBuilding,
  onRetryBuilding,
}: AgenticDockProps) {
  const headerRef = useRef<HTMLElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const creatorDrawerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [internalActiveToolId, setInternalActiveToolId] = useState<string>("");
  const [showCreator, setShowCreator] = useState<boolean>(false);
  const [creatorPrompt, setCreatorPrompt] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [transientMessage, setTransientMessage] = useState<string | null>(null);
  const activeToolId = controlledActiveToolId ?? internalActiveToolId;

  const suggestions = cityName?.trim()
    ? [
        `Flashcards for ${cityName}`,
        `Compare two sources on ${cityName}`,
        `A timeline of ${cityName}`,
      ]
    : ["Flashcards", "A reading list", "A timeline"];

  const closeCreator = () => {
    setShowCreator(false);
    setCreatorPrompt("");
    setSelectedIndex(-1);
    plusButtonRef.current?.focus();
  };

  const handleSelectSuggestion = (text: string) => {
    const query = text.trim();
    if (!query) return;
    closeCreator();
    if (isBuilding) {
      setTransientMessage(`Still building ${buildingName || "tool"}`);
      setTimeout(() => setTransientMessage(null), 3000);
      return;
    }
    onSubmitToolPrompt?.(query);
  };

  // Focus input when creator opens
  useEffect(() => {
    if (showCreator) {
      inputRef.current?.focus();
    }
  }, [showCreator]);

  // Global ⌘K shortcut for agent conversation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onSelectTool?.("agent");
      }
      if (e.key === "Escape" && showCreator) {
        closeCreator();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelectTool, showCreator]);

  // Click outside to close creator drawer
  useEffect(() => {
    if (!showCreator) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        creatorDrawerRef.current &&
        !creatorDrawerRef.current.contains(target) &&
        plusButtonRef.current &&
        !plusButtonRef.current.contains(target)
      ) {
        closeCreator();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showCreator]);

  // Measure dock offset dynamically from the capsule and publish --dock-bottom and --dock-offset to :root
  const { dockStyle, dockPosition } = useThemeStore();
  const isBottom = dockPosition === "bottom";
  const currentStyle = DOCK_STYLES[dockStyle] || DOCK_STYLES.glass;
  const isReducedMotion = prefersReducedMotion();

  useEffect(() => {
    const el = capsuleRef.current || headerRef.current;
    if (!el) return;

    const updateDockOffset = () => {
      const rect = el.getBoundingClientRect();
      if (isBottom) {
        const offset = Math.round(window.innerHeight - rect.top);
        document.documentElement.style.setProperty("--dock-bottom", `${offset}px`);
        document.documentElement.style.setProperty("--dock-offset", `${offset}px`);
      } else {
        const offset = Math.round(rect.bottom);
        document.documentElement.style.setProperty("--dock-bottom", `${offset}px`);
        document.documentElement.style.setProperty("--dock-offset", `${offset}px`);
      }
    };

    updateDockOffset();

    const ro = new ResizeObserver(() => {
      updateDockOffset();
    });
    ro.observe(el);

    window.addEventListener("resize", updateDockOffset);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateDockOffset);
    };
  }, [isBottom]);

  const handleToolClick = (toolId: string) => {
    if (showCreator) closeCreator();
    const nextToolId = activeToolId === toolId ? "" : toolId;
    if (controlledActiveToolId === undefined) {
      setInternalActiveToolId(nextToolId);
    }
    onSelectTool?.(nextToolId);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelectSuggestion(suggestions[selectedIndex]);
      } else if (creatorPrompt.trim()) {
        handleSelectSuggestion(creatorPrompt.trim());
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeCreator();
    }
  };

  const activeStatus =
    transientMessage ||
    (isBuilding
      ? statusText || `Building ${buildingName || "tool"}…`
      : statusText && (statusText.includes("Couldn't") || statusText.includes("Failed"))
      ? statusText
      : null);

  const defaultTools = cityName ? CITY_DOCK_TOOLS : HOME_DOCK_TOOLS;
  const baseTools = explicitTools ?? defaultTools;
  const allTools = [...baseTools, ...extraTools];

  const drawerElement = (
    <AnimatePresence>
      {showCreator && (
        <motion.div
          ref={creatorDrawerRef}
          layout
          initial={{ opacity: 0, y: isBottom ? 6 : -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: isBottom ? 6 : -6, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "pointer-events-auto w-[calc(100vw-32px)] max-w-[460px] min-w-[340px] bg-[#0c0e14]/95 backdrop-blur-xl rounded-2xl p-2 shadow-2xl flex flex-col gap-1 z-50",
            isBottom ? "mb-2" : "mt-2"
          )}
        >
          <div className="w-full flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={creatorPrompt}
              onChange={(e) => {
                setCreatorPrompt(e.target.value);
                setSelectedIndex(-1);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Add a tool"
              className="w-full px-3 py-2 text-[15px] text-white placeholder:text-[#9aa5b8] bg-transparent outline-none rounded-xl"
              aria-label="Tool to add"
              role="combobox"
              aria-expanded={showCreator}
              aria-autocomplete="list"
              aria-controls="creator-suggestions"
              aria-activedescendant={
                selectedIndex >= 0 ? `creator-suggestion-${selectedIndex}` : undefined
              }
            />
          </div>

          <div
            id="creator-suggestions"
            role="listbox"
            className="flex flex-col gap-0.5 pt-0.5"
          >
            {suggestions.map((suggestion, idx) => {
              const isSelected = selectedIndex === idx;
              return (
                <button
                  key={suggestion}
                  id={`creator-suggestion-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => handleSelectSuggestion(suggestion)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-[15px] rounded-xl transition-colors cursor-pointer outline-none",
                    isSelected
                      ? "bg-white/[0.08] text-white"
                      : "text-[#d1d6e2] hover:bg-white/[0.05] hover:text-white"
                  )}
                >
                  {suggestion}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const statusElement = (
    <AnimatePresence>
      {activeStatus && !showCreator && (
        <motion.div
          initial={{ opacity: 0, y: isBottom ? 2 : -2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: isBottom ? 2 : -2 }}
          transition={{ duration: 0.15 }}
          aria-live="polite"
          className={cn(
            "pointer-events-auto text-[13px] text-[#9aa5b8] flex items-center gap-1.5 px-3 py-1 bg-[#0c0e14]/90 backdrop-blur-md rounded-full shadow-lg",
            isBottom ? "mb-2" : "mt-2"
          )}
        >
          <span>{activeStatus}</span>
          {activeStatus.includes("Couldn't build that") && onRetryBuilding && (
            <button
              type="button"
              onClick={onRetryBuilding}
              className="text-[var(--accent-lime)] hover:underline cursor-pointer ml-1"
            >
              Try again.
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <header
      ref={headerRef}
      className={cn(
        "fixed left-0 right-0 z-50 flex flex-col items-center select-none pointer-events-none",
        isBottom ? "bottom-0 pb-3" : "top-0 pt-3",
        className
      )}
    >
      {/* If bottom dock, show drawer and transient status above the capsule */}
      {isBottom && drawerElement}
      {isBottom && statusElement}

      {/* Dock Status Line (Lvl, XP, Streak) */}
      <DockStatusLine className="mb-1.5 pointer-events-auto" />

      {/* Floating Agentic Dock Capsule */}
      <motion.div
        ref={capsuleRef}
        layout
        transition={spring.soft}
        className={cn(
          "pointer-events-auto relative rounded-2xl p-1.5 flex items-center gap-1.5 transition-colors",
          currentStyle.capsuleClass
        )}
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
                  "group relative w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl transition-all duration-150 cursor-pointer focus:outline-none",
                  isActive ? currentStyle.activeItemClass : currentStyle.inactiveItemClass,
                  currentStyle.enableLift && !isReducedMotion && "hover:scale-115",
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
                <span
                  className={cn(
                    "pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-[#171b24] text-[#f1f3f9] text-[11px] font-sans px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50",
                    isBottom ? "-top-8" : "-bottom-8"
                  )}
                >
                  {tool.label}
                </span>
              </motion.button>
            );
          })}

          {/* Ghost Slot for Tool Being Built */}
          {isBuilding && (
            <motion.button
              layout
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={spring.soft}
              key="dock-ghost-building-slot"
              type="button"
              onClick={onStopBuilding}
              aria-label="Stop building"
              aria-busy="true"
              className={cn(
                "group relative w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl bg-white/[0.04] text-[var(--accent-lime)] cursor-pointer focus:outline-none transition-all duration-150",
                currentStyle.enableLift && !isReducedMotion && "hover:scale-115"
              )}
            >
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="28 28"
                  className="opacity-75"
                />
              </svg>
              <span
                className={cn(
                  "pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-[#171b24] text-[#f1f3f9] text-[11px] font-sans px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50",
                  isBottom ? "-top-8" : "-bottom-8"
                )}
              >
                Stop building
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Dynamic Tool Creator Button */}
        <button
          ref={plusButtonRef}
          type="button"
          onClick={() => {
            if (showCreator) {
              closeCreator();
            } else {
              setShowCreator(true);
            }
          }}
          aria-expanded={showCreator}
          aria-label="Add a tool"
          className={cn(
            "group relative w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl transition-all duration-150 cursor-pointer focus:outline-none",
            !showCreator && currentStyle.inactiveItemClass,
            showCreator && "text-white bg-white/[0.08]",
            currentStyle.enableLift && !isReducedMotion && "hover:scale-115"
          )}
        >
          <Plus
            size={20}
            className={cn(
              "transition-transform duration-150 origin-center",
              showCreator && "rotate-45"
            )}
          />
          <span
            className={cn(
              "pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-[#171b24] text-[#f1f3f9] text-[11px] font-sans px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50",
              isBottom ? "-top-8" : "-bottom-8"
            )}
          >
            Add
          </span>
        </button>
      </motion.div>

      {/* If top dock, show drawer and transient status below the capsule */}
      {!isBottom && drawerElement}
      {!isBottom && statusElement}
    </header>
  );
}
