import { cn } from "@/lib/cn";

export interface KeptTab {
  id: string;
  render: () => React.ReactNode;
}

interface TabHostProps {
  tabs: KeptTab[];
  activeId: string;
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
export function TabHost({ tabs, activeId, className = "" }: TabHostProps) {
  return (
    <>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            hidden={!active}
            className={cn(active && "contents", className)}
            data-tab-host-id={tab.id}
            data-tab-host-active={active ? "true" : "false"}
          >
            {tab.render()}
          </div>
        );
      })}
    </>
  );
}
