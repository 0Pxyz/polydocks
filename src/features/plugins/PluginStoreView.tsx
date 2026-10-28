import { useState, useEffect, useCallback } from "react";
import {
  MagnifyingGlass,
  DownloadSimple,
  Check,
  Storefront,
  Sparkle,
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
 * Replaces floating window boxes with a full-content application view
 * consistent with Settings and City Workspaces.
 */
export function PluginStoreView({ onOpenPlugin }: PluginStoreViewProps) {
  const { activeWorkspaceId, workspacePlugins, fetchWorkspacePlugins } = useWorkspaceStore();
  const [plugins, setPlugins] = useState<RegistryPluginCard[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const fetchRegistry = useCallback(async () => {
    setLoading(true);
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
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag]);

  useEffect(() => {
    fetchRegistry();
  }, [fetchRegistry]);

  const handleInstall = async (pluginId: string) => {
    setInstallingId(pluginId);
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
      }
    } catch {
      // ignore
    } finally {
      setInstallingId(null);
    }
  };

  const installedSet = new Set(workspacePlugins.map((wp) => wp.pluginId));
  const allTags = ["All", "Productivity", "Timer", "Focus", "Micro-app"];

  return (
    <div className="w-full max-w-5xl px-4 py-8 flex flex-col items-center gap-8 select-none">
      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-normal mb-2">
          Plugin Store
        </h1>
        <p className="text-sm text-[#9aa5b8] max-w-md font-sans">
          Discover, install, and share agent-synthesized tools across your workspaces
        </p>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <MagnifyingGlass
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa5b8]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plugins by name, tag, or description..."
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-[#9aa5b8] focus:outline-none focus:border-[var(--accent-lime)]/50 transition-colors font-sans"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap",
                selectedTag === tag
                  ? "bg-[var(--accent-lime)] text-black font-semibold"
                  : "bg-white/[0.04] text-[#9aa5b8] hover:text-white hover:bg-white/[0.08]"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Plugin Cards Grid */}
      <div className="w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-xs text-[#9aa5b8] gap-2">
            <Sparkle size={20} className="text-[var(--accent-lime)] animate-spin" />
            <span>Browsing community catalog…</span>
          </div>
        ) : plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Storefront size={32} className="text-[#9aa5b8] mb-2 opacity-50" />
            <h3 className="text-sm font-semibold text-white mb-1">No plugins found</h3>
            <p className="text-xs text-[#9aa5b8] max-w-sm">
              Try adjusting your search or ask the Agent: "Build a Pomodoro timer and publish it".
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
            {plugins.map((plugin) => {
              const isInstalled = installedSet.has(plugin.id);
              const isInstalling = installingId === plugin.id;
              const IconComp = resolveIcon(plugin.icon);

              return (
                <div
                  key={plugin.id}
                  className="flex flex-col justify-between p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 transition-all duration-150 group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-[var(--accent-lime)] shrink-0">
                          <IconComp size={18} />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white group-hover:text-[var(--accent-lime)] transition-colors">
                            {plugin.name}
                          </h3>
                          <span className="text-[10px] text-[#9aa5b8] font-mono">
                            v{plugin.version} · by {plugin.author}
                          </span>
                        </div>
                      </div>

                      <span className="text-[10px] text-[#9aa5b8] font-mono flex items-center gap-1 shrink-0 bg-white/[0.04] px-2 py-0.5 rounded-full">
                        <DownloadSimple size={11} />
                        {plugin.downloads}
                      </span>
                    </div>

                    <p className="text-xs text-[#9aa5b8] line-clamp-2 mb-3 leading-relaxed font-sans">
                      {plugin.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {plugin.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] font-mono text-[#9aa5b8] bg-white/[0.04] px-2 py-0.5 rounded"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                    <span className="text-[11px] text-[#9aa5b8] truncate font-sans">
                      {isInstalled ? "Mounted in dock" : "Available to install"}
                    </span>

                    {isInstalled ? (
                      <button
                        type="button"
                        onClick={() => onOpenPlugin?.(plugin.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.08] hover:bg-white/[0.12] text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Check size={13} className="text-[var(--accent-lime)]" weight="bold" />
                        <span>Open</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isInstalling}
                        onClick={() => handleInstall(plugin.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-lime)] text-black hover:opacity-90 rounded-lg text-xs font-semibold transition-opacity cursor-pointer disabled:opacity-50"
                      >
                        <DownloadSimple size={13} weight="bold" />
                        <span>{isInstalling ? "Installing…" : "Install"}</span>
                      </button>
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
