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
  const { activeWorkspaceId, workspacePlugins, fetchWorkspaces, fetchWorkspacePlugins } = useWorkspaceStore();
  const [plugins, setPlugins] = useState<RegistryPluginCard[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

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

  const handleInstall = async (pluginId: string) => {
    setInstallingId(pluginId);
    setFailedId(null);
    try {
      const res = await fetch(`/api/registry/${encodeURIComponent(pluginId)}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: activeWorkspaceId }),
      });
      if (res.ok) {
        await fetchWorkspacePlugins(activeWorkspaceId);
        await fetchRegistry();
        if (onOpenPlugin) {
          onOpenPlugin(pluginId);
        }
      } else {
        setFailedId(pluginId);
      }
    } catch {
      setFailedId(pluginId);
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
                      handleInstall(plugin.id);
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
    </div>
  );
}
