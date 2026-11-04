import { useCallback } from "react";
import { create } from "zustand";
import { platformStorage } from "@/lib/platform/storage";

const TAB_STATE_KEY = "polydocks-tab-state";

type TabStateValues = Record<string, unknown>;

function loadTabState(): TabStateValues {
  const stored = platformStorage.getItem<TabStateValues>(TAB_STATE_KEY);
  return stored && typeof stored === "object" ? stored : {};
}

function persistTabState(values: TabStateValues): void {
  platformStorage.setItem(TAB_STATE_KEY, values);
}

interface TabStateStore {
  values: TabStateValues;
  setKey: (composite: string, value: unknown) => void;
  clearTab: (tabId: string) => void;
}

/** Test seam: the underlying persisted key-value store. */
export const useTabStateStore = create<TabStateStore>((set) => ({
  values: typeof window === "undefined" ? {} : loadTabState(),
  setKey: (composite, value) =>
    set((state) => {
      const values = { ...state.values, [composite]: value };
      persistTabState(values);
      return { values };
    }),
  clearTab: (tabId) =>
    set((state) => {
      const prefix = `${tabId}::`;
      const values = Object.fromEntries(
        Object.entries(state.values).filter(([k]) => !k.startsWith(prefix))
      );
      persistTabState(values);
      return { values };
    }),
}));

/**
 * Persisted per-tab UI state (platform runtime contract).
 *
 * Survives tab switches, hibernation, and page reloads: values live in a
 * store backed by localStorage, keyed by tab + key. The host restores the
 * surface with the same tab id, so state is there when the tab comes back.
 * Use for filters, drafts, scroll anchors, wizard steps — anything the tab
 * must not lose. Never for secrets.
 */
export function useTabState<T>(tabId: string, key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const composite = `${tabId}::${key}`;
  const stored = useTabStateStore((s) => (composite in s.values ? (s.values[composite] as T) : initial));
  const setKey = useTabStateStore((s) => s.setKey);
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = composite in useTabStateStore.getState().values
        ? (useTabStateStore.getState().values[composite] as T)
        : initial;
      setKey(composite, typeof next === "function" ? (next as (prev: T) => T)(prev) : next);
    },
    [composite, initial, setKey]
  );
  return [stored, setValue];
}

/** Drops all persisted keys for a tab (call on plugin uninstall). */
export function clearTabState(tabId: string): void {
  useTabStateStore.getState().clearTab(tabId);
}

/** Test-only reset of the in-memory snapshot (persisted storage untouched unless cleared). */
export function resetTabStateForTests(): void {
  useTabStateStore.setState({ values: {} });
}
