import { useState, useEffect, useCallback, useMemo } from "react";
import {
  MagnifyingGlass,
  ArrowUpRight,
  Check,
  X,
  CircleNotch,
  Storefront,
} from "@phosphor-icons/react";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";
import { cn } from "@/lib/cn";
import { resolveIcon } from "@/components/icons";

export interface RegistryPluginCard {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  author: string;
  tags: string[];
  downloads: number;
  /** Declared manifest permissions (install-time display, #180). */
  permissions?: Array<{ type: string; [key: string]: any }>;
  /** What + why lines, computed server-side in one place. */
  permissionLines?: string[];
  /** True unless every declared permission is quiet (own storage/UI). */
  requiresAcknowledge?: boolean;
}

/**
 * Install confirmation sheet (#180): shows exactly what the plugin may do
 * (what + why, server-computed) and gates Install behind an acknowledge
 * checkbox. Only used when requiresAcknowledge is true; quiet plugins keep
 * the one-click install. Same honest style as the MCP pre-connect preview.
 */
export function InstallConfirmSheet({
  pluginName,
  permissionLines,
  installing,
  onConfirm,
  onCancel,
}: {
  pluginName: string;
  permissionLines: string[];
  installing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-label={`Install ${pluginName}`}>
      <div className="w-full max-w-md p-5 rounded-2xl bg-[#0c0e14] border border-white/15 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Install {pluginName}</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel install"
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
          <span className="text-xs font-medium text-amber-200/90">This plugin will be granted:</span>
          <div className="flex flex-col gap-1.5">
            {permissionLines.map((line) => (
              <span key={line} className="text-xs text-white/80">
                {line}
              </span>
            ))}
          </div>
          <label className="flex items-start gap-2 text-xs text-white/70 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 accent-emerald-400"
            />
            <span>I understand these permissions. I can revoke them anytime by uninstalling this plugin.</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={installing || !acknowledged}
            title={!acknowledged ? "Review and confirm the permissions above first" : undefined}
            onClick={onConfirm}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent-lime)] text-black disabled:opacity-50 transition-all cursor-pointer"
          >
            {installing ? (
              <>
                <CircleNotch size={11} className="animate-spin" />
                Installing
              </>
            ) : (
              <>
                <Check size={11} weight="bold" />
                Install
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PluginStoreViewProps {
  onDismiss?: () => void;
  onOpenPlugin?: (pluginId: string) => void;
}

/**
 * Plugin Store: Native Workspace Experience
 * Minimal catalog surface. Each card shows only what identifies the plugin:
 * icon, name, a one-line purpose, and a single quiet action. Version, author,
 * tags and download count stay behind the catalog data for a details view.
 */
export function PluginStoreView({ onDismiss, onOpenPlugin }: PluginStoreViewProps) {
  const { workspacePlugins, fetchWorkspaces, fetchWorkspacePlugins } = useWorkspaceStore();
  const [plugins, setPlugins] = useState<RegistryPluginCard[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [confirmPlugin, setConfirmPlugin] = useState<RegistryPluginCard | null>(null);

  const fetchRegistry = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (selectedTag !== "All") query.set("tag", selectedTag.toLowerCase());

      const res = await fetch(`/api/registry?${query.toString()}`);
      if (!res.ok) throw new Error("Failed to load registry");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setPlugins(json.data);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag]);

  useEffect(() => {
    fetchRegistry();
    // Hydrate the workspace list and its installed plugins; without this the
    // viewed workspace state stayed empty and installed plugins looked fresh.
    fetchWorkspaces();
  }, [fetchRegistry, fetchWorkspaces]);

  // Derive categories from the catalog itself. The user's current selection is
  // always kept in the list so an empty result set can never trap them.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const plugin of plugins) {
      for (const tag of plugin.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const rest = [...counts.keys()]
      .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0));
    if (selectedTag !== "All" && !rest.includes(selectedTag)) {
      rest.unshift(selectedTag);
    }
    return ["All", ...rest];
  }, [plugins, selectedTag]);

  const handleInstall = (plugin: RegistryPluginCard) => {
    if (installingId) return;
    // Loud permissions need an explicit acknowledge first (#180); quiet
    // plugins keep the one-click install with no new prompts.
    if (plugin.requiresAcknowledge) {
      setConfirmPlugin(plugin);
      return;
    }
    void runInstall(plugin.id);
  };

  const runInstall = async (pluginId: string) => {
    if (installingId) return;
    setInstallingId(pluginId);
    setFailedId(null);
    setInstallError(null);
    try {
      // Read fresh workspace id at action time so a stale closure never
      // installs into the wrong workspace.
      const wsId = useWorkspaceStore.getState().activeWorkspaceId || "default";
      const res = await fetch(`/api/registry/${encodeURIComponent(pluginId)}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: wsId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Install failed (HTTP ${res.status})`);
      }
      await fetchWorkspacePlugins(wsId);
      await fetchRegistry();
      if (onOpenPlugin) {
        onOpenPlugin(pluginId);
      }
    } catch (err: any) {
      setFailedId(pluginId);
      setInstallError(err?.message || "Install failed. Try again.");
    } finally {
      setInstallingId(null);
    }
  };

  const installedSet = new Set(workspacePlugins.map((wp) => wp.pluginId));

  return (
    <div className="w-full max-w-5xl px-4 py-8 flex flex-col gap-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white/95">
            Plugin Store
          </h2>
          <p className="text-xs text-[var(--text-muted)] font-sans mt-0.5">
            Install community tools into this workspace.
          </p>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search and category segmented control */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <MagnifyingGlass
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plugins…"
            className="w-full bg-white/[0.04] border border-[var(--border-subtle)] rounded-full pl-9 pr-4 py-1.5 text-xs text-white placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--border-hover)] transition-colors font-sans"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-white/[0.04] border border-[var(--border-subtle)] p-0.5">
            {categories.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs transition-colors cursor-pointer whitespace-nowrap",
                  selectedTag === tag
                    ? "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] font-medium"
                    : "text-[var(--text-muted)] hover:text-white"
                )}
              >
                {tag === "All" ? "All" : tag.charAt(0).toUpperCase() + tag.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Catalog */}
      {installError && (
        <div className="w-full px-3.5 py-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-xs text-red-200/90 font-sans">
          {installError}
        </div>
      )}
      <div className="w-full">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[76px] rounded-2xl bg-white/[0.02] animate-pulse"
              />
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
            <Storefront size={28} className="text-[var(--text-dim)]" />
            <p className="text-xs text-[var(--text-muted)]">Couldn&apos;t load the catalog.</p>
            <button
              type="button"
              onClick={fetchRegistry}
              className="text-xs text-[var(--accent-lime)] hover:underline cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Storefront size={28} className="text-[var(--text-dim)]" />
            <p className="text-xs text-[var(--text-muted)] max-w-xs mt-2">
              No plugins here yet. Ask the agent to build one, then publish it.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
            {plugins.map((plugin) => {
              const isInstalled = installedSet.has(plugin.id);
              const isInstalling = installingId === plugin.id;
              const isFailed = failedId === plugin.id;
              const IconComp = resolveIcon(plugin.icon);

              return (
                <div
                  key={plugin.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (isInstalling) return;
                    if (isInstalled) {
                      onOpenPlugin?.(plugin.id);
                    } else {
                      void handleInstall(plugin);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).click();
                    }
                  }}
                  className="group flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] focus-visible:bg-white/[0.04] outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-lime)]/40 cursor-pointer transition-colors duration-150"
                >
                  {/* Icon */}
                  <div className="w-11 h-11 rounded-[14px] bg-white/[0.06] flex items-center justify-center text-[var(--text-main)] shrink-0">
                    <IconComp size={22} />
                  </div>

                  {/* Name and purpose */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-medium text-white/95 truncate">
                        {plugin.name}
                      </h3>
                      <ArrowUpRight
                        size={13}
                        weight="bold"
                        className="text-[var(--text-dim)] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity shrink-0"
                      />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 font-sans">
                      {plugin.description}
                    </p>
                  </div>

                  {/* Single quiet action */}
                  <div
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 transition-colors",
                      isFailed
                        ? "bg-red-500/10 text-red-300"
                        : isInstalling
                          ? "bg-white/[0.04] text-[var(--text-muted)]"
                          : isInstalled
                            ? "bg-[var(--accent-lime)]/10 text-[var(--accent-lime)]"
                            : "bg-white/[0.04] text-[var(--text-muted)] group-hover:bg-[var(--accent-lime)]/10 group-hover:text-[var(--accent-lime)]"
                    )}
                  >
                    {isFailed ? (
                      <>Retry</>
                    ) : isInstalling ? (
                      <>
                        <CircleNotch size={11} className="animate-spin" />
                        Installing
                      </>
                    ) : isInstalled ? (
                      <>
                        <Check size={11} weight="bold" />
                        Open
                      </>
                    ) : (
                      <>Install</>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {confirmPlugin && (
        <InstallConfirmSheet
          pluginName={confirmPlugin.name}
          permissionLines={confirmPlugin.permissionLines ?? []}
          installing={installingId === confirmPlugin.id}
          onConfirm={() => {
            const target = confirmPlugin;
            setConfirmPlugin(null);
            void runInstall(target.id);
          }}
          onCancel={() => setConfirmPlugin(null)}
        />
      )}
    </div>
  );
}
