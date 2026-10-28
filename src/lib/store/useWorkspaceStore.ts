import { create } from "zustand";

export interface WorkspaceItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspacePluginItem {
  workspaceId: string;
  pluginId: string;
  enabled: boolean;
  position: number;
  settings: Record<string, unknown>;
  installedAt: string;
  plugin?: {
    id: string;
    name: string;
    version: string;
    description: string;
    icon: string;
    trust: string;
    surfaces?: Array<{
      id: string;
      title: string;
      icon: string;
      variant: string;
      entry?: string;
    }>;
  };
}

export interface WorkspaceState {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
  workspacePlugins: WorkspacePluginItem[];
  isLoading: boolean;
  error: string | null;

  fetchWorkspaces: () => Promise<void>;
  setActiveWorkspace: (id: string) => Promise<void>;
  createWorkspace: (
    name: string,
    description?: string,
    icon?: string
  ) => Promise<WorkspaceItem | null>;
  fetchWorkspacePlugins: (workspaceId?: string) => Promise<void>;
  mountPlugin: (workspaceId: string, pluginId: string) => Promise<boolean>;
  unmountPlugin: (workspaceId: string, pluginId: string) => Promise<boolean>;
  togglePlugin: (
    workspaceId: string,
    pluginId: string,
    enabled: boolean
  ) => Promise<boolean>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: "default",
  workspacePlugins: [],
  isLoading: false,
  error: null,

  fetchWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/workspaces");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const list = json.data as WorkspaceItem[];
        set({ workspaces: list, isLoading: false });

        // Ensure activeWorkspaceId points to a valid workspace
        const currentActive = get().activeWorkspaceId;
        const exists = list.some((w) => w.id === currentActive);
        if (!exists && list.length > 0) {
          const defaultWs = list.find((w) => w.isDefault) || list[0];
          set({ activeWorkspaceId: defaultWs.id });
          get().fetchWorkspacePlugins(defaultWs.id);
        } else if (currentActive) {
          get().fetchWorkspacePlugins(currentActive);
        }
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  setActiveWorkspace: async (id: string) => {
    set({ activeWorkspaceId: id });
    await get().fetchWorkspacePlugins(id);
  },

  createWorkspace: async (name: string, description = "", icon = "Briefcase") => {
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, icon }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (json.success && json.data) {
        const created = json.data as WorkspaceItem;
        set((state) => ({
          workspaces: [...state.workspaces, created],
          activeWorkspaceId: created.id,
        }));
        await get().fetchWorkspacePlugins(created.id);
        return created;
      }
      return null;
    } catch {
      return null;
    }
  },

  fetchWorkspacePlugins: async (targetWorkspaceId?: string) => {
    const wsId = targetWorkspaceId || get().activeWorkspaceId;
    if (!wsId) return;

    try {
      const res = await fetch(`/api/workspaces/${wsId}/plugins`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        set({ workspacePlugins: json.data });
      }
    } catch {
      // ignore
    }
  },

  mountPlugin: async (workspaceId: string, pluginId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/plugins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pluginId }),
      });
      if (!res.ok) return false;
      await get().fetchWorkspacePlugins(workspaceId);
      return true;
    } catch {
      return false;
    }
  },

  unmountPlugin: async (workspaceId: string, pluginId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/plugins/${pluginId}`, {
        method: "DELETE",
      });
      if (!res.ok) return false;
      await get().fetchWorkspacePlugins(workspaceId);
      return true;
    } catch {
      return false;
    }
  },

  togglePlugin: async (workspaceId: string, pluginId: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/plugins/${pluginId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) return false;
      await get().fetchWorkspacePlugins(workspaceId);
      return true;
    } catch {
      return false;
    }
  },
}));
