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
  Link,
  ShieldWarning,
} from "@phosphor-icons/react";
import { resolveSurfaceIcon } from "../dock/surfaceResolver";

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
}

export function PluginsView({ onDismiss, className = "" }: PluginsViewProps) {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginItem | null>(null);
  const [executions, setExecutions] = useState<Record<string, ExecutionRecord[]>>({});
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [connectingMcp, setConnectingMcp] = useState(false);

  // Install from Manifest URL state
  const [showInstallUrlModal, setShowInstallUrlModal] = useState(false);
  const [manifestUrl, setManifestUrl] = useState("");
  const [installUrlLoading, setInstallUrlLoading] = useState(false);
  const [installUrlError, setInstallUrlError] = useState<string | null>(null);
  const [pendingManifest, setPendingManifest] = useState<any | null>(null);

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

  const handleToggle = async (pluginId: string) => {
    try {
      const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/toggle`, {
        method: "POST",
      });
      if (res.ok) {
        setPlugins((prev) =>
          prev.map((p) => (p.id === pluginId ? { ...p, enabled: !p.enabled } : p))
        );
        if (selectedPlugin?.id === pluginId) {
          setSelectedPlugin((prev) => (prev ? { ...prev, enabled: !prev.enabled } : null));
        }
      }
    } catch (err) {
      console.error("Failed to toggle plugin", err);
    }
  };

  const handleUninstall = async (pluginId: string) => {
    try {
      const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPlugins((prev) => prev.filter((p) => p.id !== pluginId));
        if (selectedPlugin?.id === pluginId) {
          setSelectedPlugin(null);
        }
      }
    } catch (err) {
      console.error("Failed to uninstall plugin", err);
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
      await fetchPlugins();
    } catch (err: any) {
      setMcpError(err.message || "Network error connecting to MCP server.");
    } finally {
      setConnectingMcp(false);
    }
  };

  const handleInspectUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manifestUrl.trim()) {
      setInstallUrlError("Manifest URL is required.");
      return;
    }

    setInstallUrlLoading(true);
    setInstallUrlError(null);

    try {
      const res = await fetch("/api/plugins/install-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: manifestUrl.trim(),
          permissionsConfirmed: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setInstallUrlError(data.error || "Failed to inspect remote manifest.");
        return;
      }

      if (data.requiresConfirmation) {
        setPendingManifest(data.manifest);
      } else if (data.success) {
        setShowInstallUrlModal(false);
        setManifestUrl("");
        setPendingManifest(null);
        await fetchPlugins();
      }
    } catch (err: any) {
      setInstallUrlError(err.message || "Network error fetching manifest.");
    } finally {
      setInstallUrlLoading(false);
    }
  };

  const handleConfirmInstallUrl = async () => {
    setInstallUrlLoading(true);
    setInstallUrlError(null);

    try {
      const res = await fetch("/api/plugins/install-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: manifestUrl.trim(),
          permissionsConfirmed: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setInstallUrlError(data.error || "Failed to install plugin.");
        return;
      }

      setShowInstallUrlModal(false);
      setManifestUrl("");
      setPendingManifest(null);
      await fetchPlugins();
    } catch (err: any) {
      setInstallUrlError(err.message || "Network error installing plugin.");
    } finally {
      setInstallUrlLoading(false);
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
            onClick={() => {
              setPendingManifest(null);
              setInstallUrlError(null);
              setShowInstallUrlModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/30 active:scale-95 transition-all"
          >
            <Link className="w-3.5 h-3.5" weight="bold" />
            <span>Install URL</span>
          </button>

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

      {/* Install Plugin from Manifest URL Modal */}
      {showInstallUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg p-5 rounded-2xl bg-[#0c0e14] border border-white/15 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Link className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">Install Plugin from Manifest URL</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowInstallUrlModal(false);
                  setPendingManifest(null);
                }}
                className="p-1 rounded-md text-white/50 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {installUrlError && (
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {installUrlError}
              </div>
            )}

            {!pendingManifest ? (
              <form onSubmit={handleInspectUrl} className="flex flex-col gap-3">
                <p className="text-xs text-white/60">
                  Enter the URL of a remote <code className="text-sky-300">plugin.json</code> manifest. The runtime will validate its schema and prompt you to inspect requested permissions before installing.
                </p>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-white/70">Manifest URL</label>
                  <input
                    type="url"
                    placeholder="https://example.com/plugins/my-tool/plugin.json"
                    value={manifestUrl}
                    onChange={(e) => setManifestUrl(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-sky-500/50"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowInstallUrlModal(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={installUrlLoading}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500 hover:bg-sky-600 text-black font-semibold disabled:opacity-50 transition-all"
                  >
                    <span>{installUrlLoading ? "Inspecting…" : "Inspect Manifest"}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{pendingManifest.name}</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/70">v{pendingManifest.version}</span>
                  </div>
                  <p className="text-xs text-white/60">{pendingManifest.description}</p>
                  <div className="text-[11px] text-white/40 font-mono mt-1">
                    ID: {pendingManifest.id} • Capabilities: {pendingManifest.capabilities?.length || 0}
                  </div>
                </div>

                {/* Permissions Confirmation List */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <ShieldWarning className="w-4 h-4 text-amber-400" weight="bold" />
                    <span>Requested Permissions</span>
                  </div>
                  {pendingManifest.permissions && pendingManifest.permissions.length > 0 ? (
                    <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 max-h-40 overflow-y-auto">
                      {pendingManifest.permissions.map((perm: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-white/80 font-mono">
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {perm.type}
                          </span>
                          <span className="text-[11px] text-white/60 truncate">
                            {perm.type === "net" && `Hosts: ${perm.hosts?.join(", ")}`}
                            {perm.type === "exec" && `Commands: ${perm.commands?.join(", ")}`}
                            {perm.type === "fs" && `Scope: ${perm.scope} (${perm.mode})`}
                            {perm.type === "mcp" && `Server: ${perm.server}`}
                            {perm.type === "secret" && `Secret: ${perm.name}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-emerald-400/80 italic">No special permissions requested.</span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setPendingManifest(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmInstallUrl}
                    disabled={installUrlLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-black font-semibold disabled:opacity-50 transition-all"
                  >
                    <Check className="w-3.5 h-3.5" weight="bold" />
                    <span>{installUrlLoading ? "Installing…" : "Grant & Install"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
