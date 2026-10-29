import { useState, useRef, useEffect } from "react";
import {
  Compass,
  Globe,
  NotePencil,
  Sparkle,
  Plus,
  Storefront,
  Folder,
  Gear,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { DockIcon } from "@/components/icons/DockIcon";
import { spring, prefersReducedMotion } from "@/lib/motion";
import type { IconComponent } from "@/components/icons/adapter";
import { resolveUniqueIcon } from "@/components/icons/adapter";
import { useThemeStore } from "@/lib/theme";
import { useDockStore } from "@/lib/store/useDockStore";
import { computeVisibleCap, DOCK_CORE_CATALOG } from "@/lib/dock/dockModel";
import { DOCK_STYLES } from "./styles";
import { DockStatusLine } from "@/features/profile/DockStatusLine";

export * from "./legacyAdapter";
export * from "./surfaceResolver";

export interface DockToolItem {
  id: string;
  label: string;
  type: "icon" | "text" | "terminal";
  icon?: IconComponent | React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** Icon key for search rows and uniqueness checks (kept when icon is resolved). */
  iconKey?: string;
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
  iconKey: "storefront",
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
    icon: Gear,
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
    icon: Gear,
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
  onOpenSearch?: () => void;
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
  onOpenSearch,
  isBuilding = false,
  buildingName,
  statusText,
  onStopBuilding,
  onRetryBuilding,
}: AgenticDockProps) {
  const headerRef = useRef<HTMLElement>(null);
  const baseHudRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);

  const [internalActiveToolId, setInternalActiveToolId] = useState<string>("");
  const [barWidth, setBarWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const activeToolId = controlledActiveToolId ?? internalActiveToolId;

  // Single action layer: pinned order and open tabs live in the dock store,
  // shared with the search palette and the agent.
  const pinnedToolIds = useDockStore((s) => s.pinnedToolIds);
  const openIds = useDockStore((s) => s.openIds);

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

  // Measure the full-width bar so the visible cap derives from available
  // width instead of a magic item count.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setBarWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { dockStyle, dockPosition } = useThemeStore();
  const isBottom = dockPosition === "bottom";
  const currentStyle = DOCK_STYLES[dockStyle] || DOCK_STYLES.glass;
  const isReducedMotion = prefersReducedMotion();

  useEffect(() => {
    const el = baseHudRef.current || capsuleRef.current || headerRef.current;
    if (!el) return;

    const updateDockOffset = () => {
      const rect = el.getBoundingClientRect();
      if (isBottom) {
        const bottomOffset = Math.max(0, Math.round(window.innerHeight - rect.top));
        document.documentElement.style.setProperty("--dock-offset", `${bottomOffset}px`);
        document.documentElement.style.setProperty("--dock-bottom-offset", `${bottomOffset}px`);
        document.documentElement.style.setProperty("--dock-top-offset", "0px");
        document.documentElement.style.setProperty("--dock-bottom", `${bottomOffset}px`);
        document.documentElement.style.setProperty("--dock-top", "0px");
      } else {
        const topOffset = Math.max(0, Math.round(rect.bottom));
        document.documentElement.style.setProperty("--dock-offset", `${topOffset}px`);
        document.documentElement.style.setProperty("--dock-top-offset", `${topOffset}px`);
        document.documentElement.style.setProperty("--dock-bottom-offset", "0px");
        document.documentElement.style.setProperty("--dock-top", `${topOffset}px`);
        document.documentElement.style.setProperty("--dock-bottom", "0px");
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
    const nextToolId = activeToolId === toolId ? "" : toolId;
    if (controlledActiveToolId === undefined) {
      setInternalActiveToolId(nextToolId);
    }
    onSelectTool?.(nextToolId);
  };

  const activeStatus =
    isBuilding
      ? statusText || `Building ${buildingName || "tool"}…`
      : statusText && (statusText.includes("Couldn't") || statusText.includes("Failed"))
      ? statusText
      : null;

  const defaultTools = cityName ? CITY_DOCK_TOOLS : HOME_DOCK_TOOLS;
  const baseTools = explicitTools ?? defaultTools;
  // The bar can show any builtin catalog item, not just the mode slice, so a
  // pinned or open tool never vanishes for missing a local definition.
  const universe: DockToolItem[] = [...baseTools];
  for (const item of DOCK_CORE_CATALOG) {
    if (!universe.some((tool) => tool.id === item.id)) {
      universe.push({ id: item.id, label: item.label, type: "icon", iconKey: item.icon });
    }
  }
  const allTools = [...universe, ...extraTools];

  // The bar stays small and curated: pinned items first (in pinned order),
  // then open unpinned items. Everything else is reachable through search.
  // The visible slice derives from measured bar width, never a magic count.
  const visibleCap = computeVisibleCap(barWidth);
  const byId = new Map(allTools.map((tool) => [tool.id, tool]));
  const orderedIds = [
    ...pinnedToolIds,
    ...openIds.filter((id) => !pinnedToolIds.includes(id)),
  ];
  const visibleTools = orderedIds
    .map((id) => byId.get(id))
    .filter((tool): tool is DockToolItem => tool !== undefined)
    .slice(0, visibleCap);

  // Every visible item gets a unique icon: the first tool keeps its icon,
  // later duplicates fall back to deterministic distinct glyphs.
  const usedIcons = new Set<IconComponent>();
  const barIcons = new Map<string, IconComponent>();
  for (const tool of visibleTools) {
    const key = tool.iconKey || tool.id;
    const resolved = resolveUniqueIcon(key, usedIcons);
    usedIcons.add(resolved);
    barIcons.set(tool.id, resolved);
  }

  const statusElement = (
    <AnimatePresence>
      {activeStatus && (
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
      {/* If bottom dock, show transient status above the capsule */}
      {isBottom && statusElement}

      {/* Stable Base HUD (Status Line + Dock Capsule) */}
      <div ref={baseHudRef} className="flex flex-col items-center pointer-events-none">
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
          {visibleTools.map((tool) => {
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
                  icon={barIcons.get(tool.id) ?? tool.icon}
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

        {/* Search Button: opens dock search (⌘⇧P) */}
        <button
          type="button"
          onClick={() => onOpenSearch?.()}
          aria-label="Search tools"
          className={cn(
            "group relative w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl transition-all duration-150 cursor-pointer focus:outline-none",
            currentStyle.inactiveItemClass,
            currentStyle.enableLift && !isReducedMotion && "hover:scale-115"
          )}
        >
          <Plus size={20} className="transition-transform duration-150 origin-center" />
          <span
            className={cn(
              "pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-[#171b24] text-[#f1f3f9] text-[11px] font-sans px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50",
              isBottom ? "-top-8" : "-bottom-8"
            )}
          >
            Search tools
          </span>
        </button>
      </motion.div>
    </div>

      {/* If top dock, show transient status below the capsule */}
      {!isBottom && statusElement}
    </header>
  );
}
