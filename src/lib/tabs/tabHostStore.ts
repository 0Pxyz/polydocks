import { create } from "zustand";

/**
 * Host-owned tab lifecycle registry (platform rule: tabs never reload or
 * get interrupted by navigation).
 *
 * Only the host mounts, hides, and hibernates tabs:
 * - first open mounts the surface and counts one mount;
 * - switching away keeps it mounted but hidden (iframes keep running, so
 *   streams, uploads, and players continue);
 * - above LIVE_LIMIT live plugin tabs, the host hibernates the least
 *   recently active one (unmounts the iframe; state restores from
 *   useTabState / polymax.storage on reopen, then a remount is expected).
 * Plugins never control their own lifecycle: no conditional rendering on
 * the active tab, no key that depends on the active tab.
 */

export type TabLifecycleStatus = "live" | "hibernated";
export type TabKind = "plugin" | "view";

export interface TabEntry {
  id: string;
  kind: TabKind;
  status: TabLifecycleStatus;
  lastActiveAt: number;
  /** Monotonic activation order: newest activation wins hibernation ties. */
  seq: number;
  /** Times the surface mounted (1 on first open; +1 per restore from hibernation). */
  mountCount: number;
}

export type TaskStatus = "running" | "done" | "error" | "interrupted";

export interface TabTask {
  id: string;
  tabId: string;
  label: string;
  status: TaskStatus;
  detail?: string;
  updatedAt: number;
}

/** Live iframe tabs above this count hibernate the oldest (state restores on reopen). */
export const LIVE_TAB_LIMIT = 5;

interface TabHostState {
  tabs: Record<string, TabEntry>;
  tasks: Record<string, TabTask>;
  /** Monotonic activation clock (hibernation tie-break, no wall-clock flakes). */
  clock: number;
  openTab: (id: string, kind: TabKind) => void;
  activateTab: (id: string) => void;
  hibernateTab: (id: string) => void;
  /** Explicit close destroys the runtime entry (persisted useTabState keys survive). */
  closeTab: (id: string) => void;
  registerTask: (tabId: string, task: { id: string; label: string; detail?: string }) => void;
  updateTask: (id: string, status: TaskStatus, detail?: string) => void;
  tasksForTab: (tabId: string) => TabTask[];
  liveIds: () => string[];
}

function now(): number {
  return Date.now();
}

function enforceLimit(
  tabs: Record<string, TabEntry>,
  clock: number
): { tabs: Record<string, TabEntry>; clock: number } {
  const live = Object.values(tabs)
    .filter((t) => t.kind === "plugin" && t.status === "live")
    .sort((a, b) => a.seq - b.seq);
  if (live.length <= LIVE_TAB_LIMIT) return { tabs, clock };
  const next = { ...tabs };
  for (const victim of live.slice(0, live.length - LIVE_TAB_LIMIT)) {
    next[victim.id] = { ...victim, status: "hibernated" };
  }
  return { tabs: next, clock };
}

export const useTabHostStore = create<TabHostState>((set, get) => ({
  tabs: {},
  tasks: {},
  clock: 0,

  openTab: (id, kind) =>
    set((state) => {
      const clock = state.clock + 1;
      const existing = state.tabs[id];
      const tabs = { ...state.tabs };
      if (existing) {
        tabs[id] =
          existing.status === "hibernated"
            ? { ...existing, status: "live", lastActiveAt: now(), seq: clock, mountCount: existing.mountCount + 1 }
            : { ...existing, lastActiveAt: now(), seq: clock };
      } else {
        tabs[id] = { id, kind, status: "live", lastActiveAt: now(), seq: clock, mountCount: 1 };
      }
      const enforced = enforceLimit(tabs, clock);
      return { tabs: enforced.tabs, clock: enforced.clock };
    }),

  activateTab: (id) =>
    set((state) => {
      const existing = state.tabs[id];
      if (!existing) return {};
      const clock = state.clock + 1;
      const tabs = { ...state.tabs };
      tabs[id] =
        existing.status === "hibernated"
          ? { ...existing, status: "live", lastActiveAt: now(), seq: clock, mountCount: existing.mountCount + 1 }
          : { ...existing, lastActiveAt: now(), seq: clock };
      const enforced = enforceLimit(tabs, clock);
      return { tabs: enforced.tabs, clock: enforced.clock };
    }),

  hibernateTab: (id) =>
    set((state) => {
      const existing = state.tabs[id];
      if (!existing || existing.status === "hibernated") return {};
      const tabs: Record<string, TabEntry> = { ...state.tabs, [id]: { ...existing, status: "hibernated" } };
      const tasks = { ...state.tasks };
      for (const [taskId, task] of Object.entries(tasks)) {
        if (task.tabId === id && task.status === "running") {
          tasks[taskId] = { ...task, status: "interrupted", updatedAt: now() };
        }
      }
      return { tabs, tasks };
    }),

  closeTab: (id) =>
    set((state) => {
      if (!state.tabs[id]) return {};
      const tabs = { ...state.tabs };
      delete tabs[id];
      return { tabs };
    }),

  registerTask: (tabId, task) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [task.id]: { ...task, tabId, status: "running", updatedAt: now() },
      },
    })),

  updateTask: (id, status, detail) =>
    set((state) => {
      const existing = state.tasks[id];
      if (!existing) return {};
      return {
        tasks: {
          ...state.tasks,
          [id]: { ...existing, status, detail: detail ?? existing.detail, updatedAt: now() },
        },
      };
    }),

  tasksForTab: (tabId) =>
    Object.values(get().tasks)
      .filter((t) => t.tabId === tabId)
      .sort((a, b) => a.updatedAt - b.updatedAt),

  liveIds: () =>
    Object.values(get().tabs)
      .filter((t) => t.status === "live")
      .sort((a, b) => a.seq - b.seq)
      .map((t) => t.id),
}));

/** Test-only reset: drops the in-memory registry (persisted tab state is separate). */
export function resetTabHostForTests(): void {
  useTabHostStore.setState({ tabs: {}, tasks: {}, clock: 0 });
}
