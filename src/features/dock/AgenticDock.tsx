import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Globe,
  Sparkle,
  Plus,
  Gear,
  Toolbox,
  Hammer,
  Books,
  PlayCircle,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { DockIcon } from "@/components/icons/DockIcon";
import { spring, useReducedMotion } from "@/lib/motion";
import type { IconComponent } from "@/components/icons/adapter";
import { resolveUniqueIcon } from "@/components/icons/adapter";
import { useThemeStore } from "@/lib/theme";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { useTabHostStore } from "@/lib/tabs/tabHostStore";
import { useDockStore } from "@/lib/store/useDockStore";
import { computeVisibleCap, DOCK_CORE_CATALOG, type DockItem } from "@/lib/dock/dockModel";
import { CommandPalette } from "./CommandPalette";
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
  /** Live count pill shown on the dock icon (only for real backing data). */
  badge?: string | number;
  /** Extra line in the dock tooltip (e.g. quest progress). */
  tooltipDetail?: string;
}

export const CORE_DOCK_TOOLS: DockToolItem[] = [
  {
    id: "agent",
    label: "Poly (⌘K)",
    type: "icon",
    icon: Sparkle,
    isAgent: true,
  },
  {
    id: "onboarding",
    label: "Tour",
    type: "icon",
    icon: PlayCircle,
  },
  {
    id: "browser",
    label: "Browser",
    type: "icon",
    icon: Globe,
  },
  {
    id: "plugins",
    label: "Tools",
    type: "icon",
    icon: Toolbox,
  },
  {
    id: "creations",
    label: "Creations",
    type: "icon",
    icon: Hammer,
  },
  {
    id: "store",
    label: "Library",
    type: "icon",
    icon: Books,
  },
  {
    id: "settings",
    label: "Settings",
    type: "icon",
    icon: Gear,
  },
];

export const ROOT_DOCK_TOOLS: DockToolItem[] = CORE_DOCK_TOOLS;

export const HOME_DOCK_TOOLS: DockToolItem[] = CORE_DOCK_TOOLS;

export const DOCK_TOOLS: DockToolItem[] = ROOT_DOCK_TOOLS;

interface AgenticDockProps {
  activeToolId?: string;
  onSelectTool?: (toolId: string, opts?: { beside?: boolean }) => void;
  /** Open a dock tool in the beside panel (no-op for ineligible rows). */
  onOpenBesideItem?: (id: string) => void;
  /** Right offset (px) reserving the beside panel, mirroring the chat side offset. */
  besideOffsetPx?: number;
  className?: string;
  isAgentWorking?: boolean;
  isAgentSheetOpen?: boolean;
  extraTools?: DockToolItem[];
  /** Session-created experiences (palette catalog; installed plugins come from the store fetch). */
  sessionTools?: DockToolItem[];
  tools?: DockToolItem[];
  /** Close a dock tab (never deletes). */
  onCloseItem?: (toolId: string) => void;
  /** Submit a "create with agent" prompt. */
  onSubmitToolPrompt?: (prompt: string) => void;
  /** Send a fix prompt to the agent for a failed plugin. */
  onFixWithAgent?: (prompt: string) => void;
  onOpenAgent?: () => void;
  onOpenMcpConnect?: () => void;
  isBuilding?: boolean;
  buildingName?: string;
  statusText?: string;
  onStopBuilding?: () => void;
  onRetryBuilding?: () => void;
}

export function AgenticDock({
  activeToolId: controlledActiveToolId,
  onSelectTool,
  className,
  isAgentWorking = false,
  isAgentSheetOpen = false,
  extraTools = [],
  sessionTools = [],
  tools: explicitTools,
  onCloseItem,
  onSubmitToolPrompt,
  onFixWithAgent,
  onOpenAgent,
  onOpenMcpConnect,
  onOpenBesideItem,
  besideOffsetPx = 0,
  isBuilding = false,
  buildingName,
  statusText,
  onStopBuilding,
  onRetryBuilding,
}: AgenticDockProps) {
  const headerRef = useRef<HTMLElement>(null);
  const baseHudRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);

  const [internalActiveToolId, setInternalActiveToolId] = useState<string>("");
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [barWidth, setBarWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const activeToolId = controlledActiveToolId ?? internalActiveToolId;

  // Single source: one record per dock item. The bar shows globals +
  // the active context only; other-context records persist hidden.
  const pinnedToolIds = useDockStore((s) => s.pinnedToolIds);
  const dockSnapshot = useDockStore((s) => s.dock);
  const dockVisibleIds = useDockStore((s) => s.visibleIds);
  const openTool = useDockStore((s) => s.openTool);
  const closeTool = useDockStore((s) => s.closeTool);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    plusButtonRef.current?.focus();
  }, []);

  // Global ⌘K shortcut for agent conversation, ⌘⇧P for dock search
  // (⌘K is reserved for Agent conversation). Dock focus shortcuts live in
  // the single registry (event.code, never event.key) and are handled in
  // App so keyboard, REST, CLI and agent verbs converge.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === "KeyK" && (e.metaKey || e.ctrlKey)) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        onSelectTool?.("agent");
      }
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.code === "KeyP") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
      if (e.key === "Escape" && showSearch) {
        e.preventDefault();
        closeSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelectTool, showSearch, closeSearch]);

  // Click outside closes the search panel (the dock X button owns it too)
  useEffect(() => {
    if (!showSearch) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        searchPanelRef.current &&
        !searchPanelRef.current.contains(target) &&
        plusButtonRef.current &&
        !plusButtonRef.current.contains(target)
      ) {
        setShowSearch(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSearch]);

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
  // Running background tasks (registered via polydocks.task) surface as a
  // quiet dot on the owning tool: work continues with the tab hidden.
  // NOTE: select the stable tasks object (never build a fresh Set/Array in
  // the selector): an unstable selector identity retriggers subscribers on
  // every store notification and React bails out with maximum-update-depth.
  const tasks = useTabHostStore((s) => s.tasks);
  const runningTaskTabIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of Object.values(tasks)) {
      if (t.status === "running") ids.add(t.tabId);
    }
    return ids;
  }, [tasks]);
  // When the reduced chat sits beside the content, the fixed dock recenters
  // in the remaining space instead of the full width (otherwise icons spill
  // out of the capsule and the dock reads as cut off).
  const sideOffset = useConversationStore((s) => (s.layoutState === "side" ? s.sideWidth : 0));
  // Ring "needs you" state: a pending approval pulses the agent glyph.
  const hasPendingApproval = useConversationStore((s) => s.activeApproval !== null);
  const currentStyle = DOCK_STYLES[dockStyle] || DOCK_STYLES.glass;
  const isReducedMotion = useReducedMotion();

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

  const handleToolClick = (toolId: string, beside = false) => {
    // Shift+click opens beside instead of focusing into the main view
    // (works on the focused tool too: it moves beside).
    if (beside) {
      onSelectTool?.(toolId, { beside: true });
      return;
    }
    // One click always resolves: clicking the focused item closes it,
    // clicking another focuses it (background items come forward).
    // Never a visible-but-inaccessible state.
    if (activeToolId === toolId) {
      closeTool(toolId);
      if (controlledActiveToolId === undefined) setInternalActiveToolId("");
      onSelectTool?.("");
      return;
    }
    openTool(toolId);
    if (controlledActiveToolId === undefined) {
      setInternalActiveToolId(toolId);
    }
    onSelectTool?.(toolId);
  };

  const activeStatus =
    isBuilding
      ? statusText || `Building ${buildingName || "tool"}…`
      : statusText && (statusText.includes("Couldn't") || statusText.includes("Failed"))
      ? statusText
      : null;

  const baseTools = explicitTools ?? HOME_DOCK_TOOLS;
  // The bar can show any builtin catalog item, not just the mode slice, so a
  // pinned or open tool never vanishes for missing a local definition.
  const universe: DockToolItem[] = [...baseTools];
  for (const item of DOCK_CORE_CATALOG) {
    if (!universe.some((tool) => tool.id === item.id)) {
      universe.push({ id: item.id, label: item.label, type: "icon", iconKey: item.icon });
    }
  }
  const allTools = [...universe, ...extraTools];

  // Single-source ordering: the dock_items registration order is stable and
  // never recalculated. Visible = globals + active context (other contexts
  // persist hidden, so other-context items never show and nothing reshuffles
  // on return). Pinned globals not yet registered still appear once.
  const visibleCap = computeVisibleCap(barWidth);
  const byId = new Map(allTools.map((tool) => [tool.id, tool]));
  const dockVisible = dockVisibleIds();
  const stableOrder = dockSnapshot.order.filter((id) => byId.has(id));
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const take = (id: string) => {
    if (!seen.has(id) && byId.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  };
  // Pinned first (pinned order), then visible in stable registration
  // order. Opened items stay "open" forever, so the width cap below can
  // push a just-opened tool behind every stale open — the focused swap
  // after the slice guarantees what is open on screen shows in the bar.
  for (const id of pinnedToolIds) {
    const record = dockSnapshot.items[id];
    if (!record || dockVisible.includes(id)) take(id);
    else if (!dockSnapshot.items[id]) take(id);
  }
  for (const id of stableOrder) {
    if (dockVisible.includes(id)) take(id);
  }
  for (const id of pinnedToolIds) take(id);
  let cappedIds = orderedIds.slice(0, Math.max(1, visibleCap));
  const focusedId = dockSnapshot.focusedId;
  if (focusedId && byId.has(focusedId) && !cappedIds.includes(focusedId)) {
    cappedIds = [...cappedIds.slice(0, Math.max(0, visibleCap - 1)), focusedId];
  }
  const visibleTools = cappedIds
    .map((id) => byId.get(id))
    .filter((tool): tool is DockToolItem => tool !== undefined);

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

  const searchElement = (
    <AnimatePresence>
      {showSearch && (
        <motion.div
          ref={searchPanelRef}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1, transition: spring.soft }}
          exit={{ height: 0, opacity: 0, transition: { duration: 0.15 } }}
          className="pointer-events-auto w-[calc(100vw-2rem)] max-w-[520px] overflow-hidden"
          role="region"
          aria-label="Dock search"
        >
          <div
            className={cn(
              "rounded-2xl p-2 flex flex-col gap-1 shadow-2xl text-white",
              currentStyle.capsuleClass
            )}
          >
            <CommandPalette
              extraItems={sessionTools.map(
                (tool): DockItem => ({
                  id: tool.id,
                  label: tool.label,
                  description: "Created with the agent",
                  icon: tool.iconKey || "cards",
                  kind: "tab",
                })
              )}
              onOpenAgent={onOpenAgent}
              onOpenMcpConnect={onOpenMcpConnect}
              onOpenItem={(toolId) => {
                openTool(toolId);
                onSelectTool?.(toolId);
              }}
              onOpenBesideItem={onOpenBesideItem}
              onCloseItem={onCloseItem}
              onSubmitToolPrompt={onSubmitToolPrompt}
              onFixWithAgent={onFixWithAgent}
              onClose={() => setShowSearch(false)}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

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
      style={{
        ...(sideOffset > 0 ? { left: sideOffset } : null),
        ...(besideOffsetPx > 0 ? { right: besideOffsetPx } : null),
      }}
      className={cn(
        "fixed left-0 right-0 z-50 flex flex-col items-center select-none pointer-events-none",
        isBottom ? "bottom-0 pb-3" : "top-0 pt-3",
        className
      )}
    >
      {/* If bottom dock, show search panel and transient status above the capsule */}
      {isBottom && showSearch && (
        <div className="mb-2 pointer-events-none flex flex-col items-center">
          {searchElement}
        </div>
      )}
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
          {visibleTools.map((tool, index) => {
            const isAgent = tool.isAgent;
            const isActive = isAgent
              ? activeToolId === tool.id || isAgentSheetOpen
              : activeToolId === tool.id;
            // Shortcut number only on hover/focus: no permanent chrome.
            const shortcutHint = index < 9 ? `Ctrl+Shift+${index + 1}` : null;

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
                data-dock-index={index}
                onClick={(e) => handleToolClick(tool.id, e.shiftKey)}
                className={cn(
                  "group relative w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-lime)]",
                  isActive ? currentStyle.activeItemClass : currentStyle.inactiveItemClass,
                  currentStyle.enableLift && !isReducedMotion && "hover:scale-115",
                  !isActive &&
                    isAgent &&
                    isAgentWorking &&
                    "text-[var(--accent-lime)] shadow-[0_0_12px_rgba(200,255,87,0.3)]"
                )}
                aria-label={tool.label}
                aria-current={isActive ? "true" : undefined}
                tabIndex={0}
              >
                <DockIcon
                  icon={barIcons.get(tool.id) ?? tool.icon}
                  name={tool.id}
                  isActive={isActive}
                  isAgent={isAgent}
                  isAgentWorking={isAgentWorking}
                  needsAttention={isAgent && hasPendingApproval}
                  size={20}
                />

                {tool.badge !== undefined && (
                  <span className="pointer-events-none absolute -top-1 -right-1 z-10 min-w-5 h-5 px-1 rounded-full bg-white/15 text-white text-[10px] font-mono font-semibold flex items-center justify-center">
                    {tool.badge}
                  </span>
                )}
                {tool.badge === undefined && runningTaskTabIds.has(tool.id) && (
                  <span
                    className="pointer-events-none absolute -top-0.5 -right-0.5 z-10 h-2 w-2 rounded-full bg-[var(--accent-lime)] animate-pulse"
                    title="Background task running"
                  />
                )}

                {/* Tooltip (hover/focus only; shortcut number never permanent) */}
                <span
                  className={cn(
                    "pointer-events-none absolute opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 bg-[#171b24] text-[#f1f3f9] text-[11px] font-sans px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50",
                    isBottom ? "-top-8" : "-bottom-8"
                  )}
                >
                  {tool.label}
                  {tool.tooltipDetail && (
                    <span className="text-white/50"> — {tool.tooltipDetail}</span>
                  )}
                  {shortcutHint && (
                    <span className="text-white/50"> · {shortcutHint}</span>
                  )}
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
              <svg className={isReducedMotion ? "w-5 h-5" : "w-5 h-5 animate-spin"} viewBox="0 0 24 24" fill="none">
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

        {/* Search Button: opens dock search inline (⌘⇧P) */}
        <button
          ref={plusButtonRef}
          type="button"
          onClick={() => setShowSearch((prev) => !prev)}
          aria-expanded={showSearch}
          aria-label={showSearch ? "Close search" : "Search tools"}
          className={cn(
            "group relative w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl transition-all duration-150 cursor-pointer focus:outline-none",
            !showSearch && currentStyle.inactiveItemClass,
            showSearch && "text-white bg-white/[0.08]",
            currentStyle.enableLift && !isReducedMotion && "hover:scale-115"
          )}
        >
          <Plus
            size={20}
            className={cn(
              "transition-transform duration-150 origin-center",
              showSearch && "rotate-45"
            )}
          />
          <span
            className={cn(
              "pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-[#171b24] text-[#f1f3f9] text-[11px] font-sans px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-50",
              isBottom ? "-top-8" : "-bottom-8"
            )}
          >
            Search tools · Enter opens · ⌘↵ pins · Esc closes
          </span>
        </button>
      </motion.div>
    </div>

      {/* If top dock, show search panel and transient status below the capsule */}
      {!isBottom && showSearch && (
        <div className="mt-2 pointer-events-none flex flex-col items-center">
          {searchElement}
        </div>
      )}
      {!isBottom && statusElement}
    </header>
  );
}
