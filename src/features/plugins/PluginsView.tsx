import { useState, useEffect } from "react";
import {
  PlugsConnected,
  Plus,
  X,
  Trash,
  Check,
  ShieldCheck,
  Globe,
  Folder,
  Key,
  TerminalWindow,
  Circle,
  ToggleLeft,
  ToggleRight,
  ShieldWarning,
} from "@phosphor-icons/react";
import { resolveSurfaceIcon } from "../dock/surfaceResolver";
import { PluginStoreView } from "./PluginStoreView";

export interface PluginItem {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  trust: "core" | "first-party" | "generated" | "external";
  enabled: boolean;
  capabilitiesCount: number;
  surfaces: Array<{ id: string; title: string; icon: string }>;
  permissions: Array<{ type: string; [key: string]: any }>;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionRecord {
  executionId: string;
  capabilityId: string;
  status: "running" | "success" | "failed" | "denied";
  durationMs: number;
  error: string | null;
  createdAt: string;
}

interface PluginsViewProps {
  onDismiss?: () => void;
  className?: string;
  initialTab?: "installed" | "discover";
  onOpenPlugin?: (pluginId: string) => void;
}

export function PluginsView({ onDismiss, className = "", initialTab = "installed", onOpenPlugin }: PluginsViewProps) {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"installed" | "discover">(initialTab);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginItem | null>(null);
  const [executions, setExecutions] = useState<Record<string, ExecutionRecord[]>>({});
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [connectingMcp, setConnectingMcp] = useState(false);
  const [mcpWarning, setMcpWarning] = useState<string | null>(null);

  // Install from Manifest URL state — removed: remote-URL install is no longer
  // offered (security: unverified remote code must never execute in the
  // workspace). Plugins come from the curated store or the agent.
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPlugins = async () => {
    try {
      const res = await fetch("/api/plugins");
      if (res.ok) {
        const data = await res.json();
        setPlugins(data.plugins || []);
        // Fetch executions for each plugin
        for (const p of data.plugins || []) {
          fetchExecutions(p.id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch plugins", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutions = async (pluginId: string) => {
    try {
      const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/executions?limit=5`);
      if (res.ok) {
        const data = await res.json();
        setExecutions((prev) => ({
          ...prev,
          [pluginId]: data.executions || [],
        }));
      }
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    fetchPlugins();
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleToggle = async (pluginId: string) => {
    const prev = plugins.find((p) => p.id === pluginId);
    // Optimistic flip with rollback on failure so the dock feels instant.
    setPlugins((prevList) =>
      prevList.map((p) => (p.id === pluginId ? { ...p, enabled: !p.enabled } : p))
    );
    setActionError(null);
    try {
      const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/toggle`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`Toggle failed (HTTP ${res.status})`);
      }
      if (selectedPlugin?.id === pluginId && prev) {
        setSelectedPlugin({ ...selectedPlugin, enabled: !prev.enabled });
      }
    } catch (err: any) {
      // Roll back to the previous enabled state.
      setPlugins((prevList) =>
        prevList.map((p) => (p.id === pluginId ? { ...p, enabled: prev?.enabled ?? p.enabled } : p))
      );
      setActionError(err?.message || "Could not change plugin state. Try again.");
    }
  };

  const handleUninstall = async (pluginId: string) => {
    const prev = plugins;
    const prevSelected = selectedPlugin;
    setPlugins((prevList) => prevList.filter((p) => p.id !== pluginId));
    if (selectedPlugin?.id === pluginId) {
      setSelectedPlugin(null);
    }
    setActionError(null);
    try {
      const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(`Uninstall failed (HTTP ${res.status})`);
      }
    } catch (err: any) {
      // Roll back: restore the list and selection.
      setPlugins(prev);
      if (prevSelected?.id === pluginId) {
        setSelectedPlugin(prevSelected);
      }
      setActionError(err?.message || "Could not uninstall plugin. Try again.");
    }
  };

  const handleConnectMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim() || !mcpUrl.trim()) {
      setMcpError("Name and server URL are required.");
      return;
    }

    setConnectingMcp(true);
    setMcpError(null);

    try {
      const res = await fetch("/api/plugins/mcp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mcpName.trim(),
          url: mcpUrl.trim(),
          token: mcpToken.trim() || undefined,
          // Submitting this form IS the explicit user confirmation
          // required by the install policy (ask-by-default).
          confirmed: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMcpError(data.error || "Failed to connect MCP server.");
        return;
      }

      setShowMcpModal(false);
      setMcpName("");
      setMcpUrl("");
      setMcpToken("");
      // Honest degradation: discovery may have failed server-side while the
      // generic adapter still installed. Say so instead of looking complete.
      setMcpWarning(typeof data.discoveryWarning === "string" ? data.discoveryWarning : null);
      await fetchPlugins();
    } catch (err: any) {
      setMcpError(err.message || "Network error connecting to MCP server.");
    } finally {
      setConnectingMcp(false);
    }
  };

  const renderStatusDots = (pluginId: string) => {
    const list = executions[pluginId] || [];
    const dots = Array.from({ length: 5 }).map((_, i) => list[i] || null);

    return (
      <div className="flex items-center gap-1">
        {dots.map((item, idx) => {
          if (!item) {
            return (
              <Circle
                key={`empty-${idx}`}
                className="w-2 h-2 text-white/10"
                weight="fill"
              />
            );
          }
          if (item.status === "success") {
            return (
              <Circle
                key={item.executionId}
                className="w-2 h-2 text-emerald-400"
                weight="fill"
              />
            );
          }
          if (item.status === "failed") {
            return (
              <Circle
                key={item.executionId}
                className="w-2 h-2 text-red-400"
                weight="fill"
              />
            );
          }
          return (
            <Circle
              key={item.executionId}
              className="w-2 h-2 text-amber-400"
              weight="fill"
            />
          );
        })}
      </div>
    );
  };

  return (
    <div
      className={`w-full max-w-5xl px-4 py-8 flex flex-col gap-6 text-white select-none ${className}`}
    >
      {mcpWarning && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <ShieldWarning className="w-4 h-4 mt-0.5 shrink-0 text-amber-300" />
          <div className="flex-1 text-xs text-amber-200/90">
            {mcpWarning}
          </div>
          <button
            type="button"
            onClick={() => setMcpWarning(null)}
            className="text-amber-200/60 hover:text-amber-100 cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white/95">
            Plugins & Extensions
          </h2>
          <p className="text-xs text-white/50 font-sans mt-0.5">
            Manage capabilities, system permissions, and external MCP servers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMcpModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" weight="bold" />
            <span>Connect MCP</span>
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs: Installed + Discover */}
      <div className="flex items-center gap-1 rounded-full bg-white/[0.04] border border-[var(--border-subtle)] p-0.5 self-start">
        {(["installed", "discover"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-xs transition-colors cursor-pointer ${
              activeTab === tab
                ? "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] font-medium"
                : "text-[var(--text-muted)] hover:text-white"
            }`}
          >
            {tab === "installed" ? "Installed" : "Discover"}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="w-full px-3.5 py-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-xs text-red-200/90">
          {actionError}
        </div>
      )}

      {activeTab === "discover" ? (
        <PluginStoreView onOpenPlugin={onOpenPlugin} />
      ) : (
      <>
      {/* Grid of Installed Plugins */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-xl border border-white/5 bg-white/[0.02] animate-pulse"
            />
          ))}
        </div>
      ) : plugins.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-white/10 rounded-2xl text-white/40 text-sm">
          No plugins registered.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {plugins.map((plugin) => {
            const Icon = resolveSurfaceIcon(plugin.icon);
            const isSelected = selectedPlugin?.id === plugin.id;

            return (
              <div
                key={plugin.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPlugin(plugin)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setSelectedPlugin(plugin);
                  }
                }}
                className={`relative p-4 rounded-xl border text-left cursor-pointer transition-all duration-150 flex flex-col justify-between gap-3 ${
                  isSelected
                    ? "border-emerald-500/50 bg-emerald-500/[0.04] shadow-lg shadow-emerald-950/20"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20"
                } ${!plugin.enabled ? "opacity-50 grayscale" : ""}`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-white/[0.06] border border-white/5">
                      <Icon className="w-4 h-4 text-white/80" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-white/95">
                          {plugin.name}
                        </span>
                        <span className="text-[10px] text-white/40 font-mono">
                          v{plugin.version}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider">
                        {plugin.trust}
                      </span>
                    </div>
                  </div>

                  {/* Enable Toggle Button */}
                  <button
                    type="button"
                    aria-label={`Toggle ${plugin.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(plugin.id);
                    }}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    {plugin.enabled ? (
                      <ToggleRight className="w-6 h-6 text-emerald-400" weight="fill" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-white/30" />
                    )}
                  </button>
                </div>

                {/* Description */}
                <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">
                  {plugin.description || "No description provided."}
                </p>

                {/* Footer with status dots & capability count */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-white/50">
                  <span>{plugin.capabilitiesCount} capabilities</span>
                  {renderStatusDots(plugin.id)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Floating Detail Sheet */}
      {selectedPlugin && (
        <div className="p-5 rounded-2xl border border-white/15 bg-[#0e1118]/90 backdrop-blur-lg flex flex-col gap-4 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/10">
                {(() => {
                  const Icon = resolveSurfaceIcon(selectedPlugin.icon);
                  return <Icon className="w-5 h-5 text-white/90" />;
                })()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white/95">
                    {selectedPlugin.name}
                  </h3>
                  <span className="text-xs text-white/40 font-mono">
                    v{selectedPlugin.version}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 font-mono uppercase text-white/60">
                    {selectedPlugin.trust}
                  </span>
                </div>
                <p className="text-xs text-white/60 font-sans mt-0.5">
                  {selectedPlugin.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedPlugin.trust !== "core" && (
                <button
                  type="button"
                  onClick={() => handleUninstall(selectedPlugin.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash className="w-3.5 h-3.5" />
                  <span>Uninstall</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedPlugin(null)}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Permission Chips */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/70">Granted Permissions:</span>
            <div className="flex flex-wrap gap-1.5">
              {selectedPlugin.permissions.length === 0 ? (
                <span className="text-xs text-white/40 italic">No special permissions requested.</span>
              ) : (
                selectedPlugin.permissions.map((perm, idx) => {
                  let label = perm.type;
                  let Icon = ShieldCheck;
                  if (perm.type === "net") {
                    label = `net:${perm.hosts?.join(",") || "*"}`;
                    Icon = Globe;
                  } else if (perm.type === "fs") {
                    label = `fs:${perm.scope} (${perm.mode})`;
                    Icon = Folder;
                  } else if (perm.type === "exec") {
                    label = `exec:${perm.commands?.join(",") || "*"}`;
                    Icon = TerminalWindow;
                  } else if (perm.type === "secret") {
                    label = `secret:${perm.name}`;
                    Icon = Key;
                  } else if (perm.type === "mcp") {
                    label = `mcp:${perm.server}`;
                    Icon = PlugsConnected;
                  }

                  return (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/10 text-xs text-white/80 font-mono"
                    >
                      <Icon className="w-3 h-3 text-white/50" />
                      {label}
                    </span>
                  );
                })
              )}
            </div>
          </div>

          {/* Last 5 Executions */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5">
            <span className="text-xs font-medium text-white/70">Recent Runs:</span>
            {executions[selectedPlugin.id]?.length ? (
              <div className="flex flex-col gap-1">
                {executions[selectedPlugin.id].map((run) => (
                  <div
                    key={run.executionId}
                    className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/5"
                  >
                    <div className="flex items-center gap-2">
                      <Circle
                        className={`w-2 h-2 ${
                          run.status === "success"
                            ? "text-emerald-400"
                            : run.status === "failed"
                              ? "text-red-400"
                              : "text-amber-400"
                        }`}
                        weight="fill"
                      />
                      <span className="font-mono text-white/80">{run.capabilityId}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/40 text-[11px] font-mono">
                      <span>{run.durationMs}ms</span>
                      <span>•</span>
                      <span>{new Date(run.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-white/40 italic">No executions logged yet.</span>
            )}
          </div>
        </div>
      )}

      {/* Connect MCP Modal */}
      {showMcpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md p-5 rounded-2xl bg-[#0c0e14] border border-white/15 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <PlugsConnected className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Connect External MCP</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMcpModal(false)}
                className="p-1 rounded-md text-white/50 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConnectMcp} className="flex flex-col gap-3">
              {mcpError && (
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {mcpError}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/70">Server Name</label>
                <input
                  type="text"
                  placeholder="e.g. Postgres MCP"
                  value={mcpName}
                  onChange={(e) => setMcpName(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/70">Server URL (HTTP or SSE)</label>
                <input
                  type="url"
                  placeholder="https://mcp.example.com/sse"
                  value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/70">Bearer Token (Optional)</label>
                <input
                  type="password"
                  placeholder="Secret token"
                  value={mcpToken}
                  onChange={(e) => setMcpToken(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowMcpModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connectingMcp}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-black font-semibold disabled:opacity-50 transition-all"
                >
                  <Check className="w-3.5 h-3.5" weight="bold" />
                  <span>{connectingMcp ? "Connecting…" : "Connect"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
