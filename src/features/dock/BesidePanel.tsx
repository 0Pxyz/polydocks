import { useState } from "react";
import { motion } from "motion/react";
import { ChevronRight, X, PanelLeft } from "lucide-react";
import { CaretDown } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { spring, useReducedMotion } from "@/lib/motion";
import { PanelHeader } from "@/components/ui/panel-header";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import { TabItem } from "@/components/ui/tab-item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveIcon } from "@/components/icons/adapter";
import { useThemeStore } from "@/lib/theme";

export interface BesideTab {
  id: string;
  title: string;
  iconKey?: string;
}

interface BesidePanelProps {
  /** Panel expanded (always mounted; hidden keeps every tab alive). */
  expanded: boolean;
  /** Panel holds beside tools (auto-hides when empty). */
  hasTools: boolean;
  /** Docked right (wide) or bottom-sheet overlay (narrow). */
  overlay: boolean;
  /** Shared panel width. */
  width: number;
  /** Left offset for the overlay sheet (chat side width): never slides under chat. */
  offsetLeft?: number;
  onWidthChange: (width: number) => void;
  tabs: BesideTab[];
  selectedId: string | null;
  runningIds: string[];
  onSelectTab: (id: string) => void;
  onRemoveTab: (id: string) => void;
  onCollapse: () => void;
  onClear: () => void;
  children: React.ReactNode;
}

const COARSE_44 = "[@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-[44px]";

/**
 * On-demand second panel. One header like the chat: the active tool name
 * on the left (a switch menu when several tools are open), icon actions
 * on the right. No tab strip, no visible scrollbar, no extra decoration.
 * Always mounted: hiding never unmounts a tool (TabHost keeps every tab
 * alive with `hidden`), so closing or collapsing the panel closes no tabs.
 */
export function BesidePanel({
  expanded,
  hasTools,
  overlay,
  width,
  offsetLeft = 0,
  onWidthChange,
  tabs,
  selectedId,
  runningIds,
  onSelectTab,
  onRemoveTab,
  onCollapse,
  onClear,
  children,
}: BesidePanelProps) {
  const reduceMotion = useReducedMotion();
  const dockPosition = useThemeStore((s) => s.dockPosition);
  const isBottom = dockPosition === "bottom";
  const visible = expanded && hasTools;
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = tabs.find((tab) => tab.id === selectedId) ?? tabs[0] ?? null;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Left edge drag: moving left widens the right-docked panel.
      onWidthChange(startWidth - (moveEvent.clientX - startX));
    };
    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <motion.div
      layoutId="polydocks-beside-surface"
      data-beside-panel="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: reduceMotion ? { duration: 0 } : spring.soft }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
      hidden={!visible}
      aria-hidden={!visible}
      style={overlay ? (offsetLeft > 0 ? { left: `${offsetLeft}px` } : undefined) : { width: `${width}px` }}
      className={cn(
        "flex flex-col bg-[var(--bg-void)]/96 backdrop-blur-2xl transition-all duration-150 select-text",
        overlay
          ? "fixed inset-x-0 bottom-0 top-auto max-h-[85vh] z-30 rounded-t-2xl border-t border-[var(--border-subtle)] shadow-2xl"
          : "fixed top-0 right-0 bottom-0 z-40 border-l border-[var(--border-subtle)] shadow-2xl",
        isBottom && !overlay && "pb-[calc(var(--dock-bottom-offset,88px)+8px)]"
      )}
    >
      {/* Resize drag edge for the docked panel */}
      {!overlay && (
        <div
          onMouseDown={startResize}
          className="absolute top-0 bottom-0 -left-1.5 w-3 cursor-col-resize z-50 group hover:bg-[var(--accent-lime)]/20 transition-colors"
          title="Drag to resize beside width"
        >
          <div className="w-[2px] h-full mx-auto bg-transparent group-hover:bg-[var(--accent-lime)] transition-colors" />
        </div>
      )}

      <PanelHeader
        title={selected?.title ?? "Beside"}
        titleNode={
          tabs.length > 1 && selected ? (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Beside tools, current: ${selected.title}. Open tool switcher.`}
                  className="flex items-center gap-1.5 min-h-[44px] -ml-1 px-1 rounded-lg text-[13px] font-semibold text-[var(--text-main)] truncate max-w-full hover:bg-[var(--overlay-subtle)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-lime)]"
                >
                  <span className="truncate">{selected.title}</span>
                  <CaretDown size={14} className="shrink-0 text-[var(--text-muted)]" weight="bold" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={8}
                className="w-64 p-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-overlay)] text-[var(--text-main)] shadow-2xl"
              >
                {tabs.map((tab, index) => {
                  const Icon = resolveIcon(tab.iconKey);
                  return (
                    <div
                      key={tab.id}
                      onClick={() => {
                        onSelectTab(tab.id);
                        setMenuOpen(false);
                      }}
                    >
                      <TabItem
                        id={tab.id}
                        title={tab.title}
                        icon={<Icon size={14} />}
                        active={tab.id === selected.id}
                        running={runningIds.includes(tab.id)}
                        index={index}
                        onSelect={(id) => {
                          onSelectTab(id);
                          setMenuOpen(false);
                        }}
                        onClose={(id) => onRemoveTab(id)}
                      />
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
        actions={
          <>
            <IconButton
              size={32}
              icon={<ChevronRight size={16} />}
              label="Collapse beside panel"
              onClick={onCollapse}
              className={COARSE_44}
            />
            <IconButton
              size={32}
              icon={<X size={16} />}
              label="Close beside tools"
              onClick={onClear}
              className={COARSE_44}
            />
          </>
        }
      />

      {/* Selected beside tool (host-owned TabHost keeps every tab mounted) */}
      <div className="relative z-0 flex-1 min-w-0 w-full min-h-0 overflow-y-auto flex flex-col">
        {tabs.length === 0 || !selected ? (
          <EmptyState
            icon={<PanelLeft size={20} />}
            title="Nothing beside"
            hint="Open a tool beside the main view to work side by side."
          />
        ) : (
          children
        )}
      </div>
    </motion.div>
  );
}
