import { cn } from "@/lib/cn";

export interface KeptTab {
  id: string;
  render: () => React.ReactNode;
}

interface TabHostProps {
  tabs: KeptTab[];
  activeId: string;
  /** Second visible tab for side-by-side panels (same mounts, two shown). */
  secondaryId?: string | null;
  className?: string;
}

/**
 * Host-owned tab mount point (platform rule: tabs never reload or get
 * interrupted by navigation).
 *
 * Every opened tab stays mounted; inactive tabs hide via the `hidden`
 * attribute (plain CSS `display: none` — iframes and players keep running,
 * React state is untouched). Hibernated tabs are NOT rendered here at all:
 * callers consult the tab host store and render a lightweight restore
 * placeholder instead, which remounts on activation (state restores from
 * useTabState / polymax.storage).
 *
 * No AnimatePresence around kept tabs: exit animations unmount, which
 * defeats the contract. Enter animations belong inside each surface.
 */
export function TabHost({ tabs, activeId, secondaryId = null, className = "" }: TabHostProps) {
  const visible = new Set([activeId, ...(secondaryId ? [secondaryId] : [])]);
  const dual = Boolean(secondaryId && secondaryId !== activeId);
  return (
    <>
      {tabs.map((tab) => {
        const active = visible.has(tab.id);
        const isSecondary = dual && tab.id === secondaryId;
        return (
          <div
            key={tab.id}
            hidden={!active}
            className={cn(active && !dual && "contents", className)}
            data-tab-host-id={tab.id}
            data-tab-host-active={active ? "true" : "false"}
            data-tab-host-panel={active ? (isSecondary ? "right" : "left") : undefined}
          >
            {tab.render()}
          </div>
        );
      })}
    </>
  );
}
