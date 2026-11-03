import { useState, useEffect, useMemo } from "react";
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
  MagnifyingGlass,
  Storefront,
  DotsThree,
  Info,
} from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveSurfaceIcon } from "../dock/surfaceResolver";
import { resolveRowAction } from "@/lib/dock/dockModel";
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
  /**
   * Locks the page to one origin trust (#382): Creations shows
   * generated-only instead of duplicating the full Installed list.
   * Tabs hide — a single-purpose page needs no tab bar.
   */
  lockTrust?: PluginItem["trust"];
}

interface InstalledListProps {
  plugins: PluginItem[];
  loading: boolean;
  executions: Record<string, ExecutionRecord[]>;
  selectedId: string | null;
  onSelect: (plugin: PluginItem) => void;
  onToggle: (pluginId: string) => void;
  onUninstall: (pluginId: string) => void;
  onOpenPlugin?: (pluginId: string) => void;
  onBrowseLibrary?: () => void;
}

/** Search and group pills appear only for long, mixed lists. */
const SHORT_LIST_LIMIT = 6;

const TRUST_SECTIONS: Array<{ trust: PluginItem["trust"]; title: string }> = [
  { trust: "core", title: "Built-in" },
  { trust: "first-party", title: "First-party" },
  { trust: "generated", title: "Generated" },
  { trust: "external", title: "MCP servers" },
];

/**
 * Installed list: the same row language as Discover (icon, name, one-line
 * purpose, one quiet action). Grouped by origin instead of a mixed grid;
 * version and capability detail live in the detail sheet, not the row.
 * MCP servers surface here with tool count and live status.
 */
function InstalledPluginList({
  plugins,
  loading,
  executions,
  selectedId,
  onSelect,
  onToggle,
  onUninstall,
  onOpenPlugin,
  onBrowseLibrary,
}: InstalledListProps) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>("All");

  const groups = useMemo(() => {
    const present = new Set(plugins.map((p) => p.trust));
    return TRUST_SECTIONS.filter((s) => present.has(s.trust as PluginItem["trust"]));
  }, [plugins]);

  const matches = (p: PluginItem) => {
    if (group !== "All") {
      const section = TRUST_SECTIONS.find((s) => s.title === group);
      if (!section || p.trust !== section.trust) return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Search + group filter appear only for long, mixed lists. */}
      {plugins.length >= SHORT_LIST_LIMIT && (
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

        {groups.length > 1 && (
          <div className="flex items-center gap-1 rounded-full bg-white/[0.04] border border-[var(--border-subtle)] p-0.5">
            {["All", ...groups.map((g) => g.title)].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setGroup(label)}
                className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer whitespace-nowrap ${
                  group === label
                    ? "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] font-medium"
                    : "text-[var(--text-muted)] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[76px] rounded-2xl bg-white/[0.02] animate-pulse"
            />
          ))}
        </div>
      ) : plugins.length === 0 ? (
        <EmptyState
          icon={<Storefront size={20} />}
          title="No tools yet"
          hint="Ask the agent to build one, then publish it."
          action={
            onBrowseLibrary ? (
              <button
                type="button"
                onClick={onBrowseLibrary}
                className="mt-1 px-3.5 py-1.5 rounded-full text-xs font-medium bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] hover:bg-[var(--accent-lime)]/25 transition-colors cursor-pointer"
              >
                Browse Library
              </button>
            ) : undefined
          }
        />
      ) : (
        TRUST_SECTIONS.map((section) => {
          const items = plugins.filter((p) => p.trust === section.trust && matches(p));
          if (items.length === 0) return null;
          return (
            <div key={section.trust} className="w-full">
              <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-dim)] mb-2">
                {section.title}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                {items.map((plugin) => {
                  const Icon = resolveSurfaceIcon(plugin.icon);
                  const isSelected = selectedId === plugin.id;
                  const isMcp = plugin.trust === "external";
                  const lastRun = (executions[plugin.id] || [])[0];
                  const mcpStatus = !plugin.enabled
                    ? "Disabled"
                    : lastRun?.status === "failed"
                      ? "Needs attention"
                      : "Connected";
                  // One click zone per row: opens what has a view, enables
                  // disabled ones, details the rest. Capability-only
                  // plugins (search, sources, …) have no surface — opening
                  // them was a silent no-op, so they open Details (#380).
                  const action = resolveRowAction(plugin);
                  const canOpen = action === "open";
                  const primaryAction = () => {
                    if (action === "enable") onToggle(plugin.id);
                    else if (action === "open") onOpenPlugin?.(plugin.id);
                    else onSelect(plugin);
                  };

                  return (
                    <div
                      key={plugin.id}
                      role="button"
                      tabIndex={0}
                      onClick={primaryAction}
                      title={plugin.enabled && !canOpen ? "No preview surface — opens details" : undefined}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          primaryAction();
                        }
                      }}
                      className={`group flex items-center gap-3.5 p-3.5 rounded-2xl outline-none transition-colors duration-150 cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--accent-lime)]/40 ${
                        isSelected
                          ? "bg-emerald-500/[0.06] ring-1 ring-emerald-500/40"
                          : "bg-white/[0.02] hover:bg-white/[0.04]"
                      } ${!plugin.enabled ? "opacity-50" : ""}`}
                    >
                      {/* Icon */}
                      <div className="w-11 h-11 rounded-[14px] bg-white/[0.06] flex items-center justify-center text-[var(--text-main)] shrink-0">
                        <Icon className="w-[22px] h-[22px]" />
                      </div>

                      {/* Name and one-line purpose */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-white/95 truncate">
                          {plugin.name}
                        </h3>
                        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 font-sans">
                          {plugin.description || "No description provided."}
                        </p>
                        {isMcp && (
                          <p className="text-[11px] text-[var(--text-dim)] truncate mt-0.5 font-sans">
                            {plugin.capabilitiesCount} tools · {mcpStatus}
                          </p>
                        )}
                      </div>

                      {/* Secondary actions live in the hover menu */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Actions for ${plugin.name}`}
                              title="Tool actions"
                              className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--accent-lime)] [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-[44px]"
                            >
                              <DotsThree size={18} weight="bold" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            sideOffset={4}
                            className="min-w-44 p-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-overlay)] text-[var(--text-main)] shadow-2xl z-50"
                          >
                            <DropdownMenuItem
                              onSelect={() => onSelect(plugin)}
                              className="gap-2.5 px-2.5 py-2 text-[13px] rounded-lg focus:bg-[var(--overlay-hover)] [@media(pointer:coarse)]:min-h-[44px]"
                            >
                              <Info size={15} className="text-[var(--text-muted)]" />
                              Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => onToggle(plugin.id)}
                              className="gap-2.5 px-2.5 py-2 text-[13px] rounded-lg focus:bg-[var(--overlay-hover)] [@media(pointer:coarse)]:min-h-[44px]"
                            >
                              {plugin.enabled ? (
                                <ToggleRight size={15} className="text-[var(--text-muted)]" weight="fill" />
                              ) : (
                                <ToggleLeft size={15} className="text-[var(--text-muted)]" />
                              )}
                              {plugin.enabled ? "Disable" : "Enable"}
                            </DropdownMenuItem>
                            {plugin.trust !== "core" && (
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => onUninstall(plugin.id)}
                                className="gap-2.5 px-2.5 py-2 text-[13px] rounded-lg [@media(pointer:coarse)]:min-h-[44px]"
                              >
                                <Trash size={15} />
                                Uninstall
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {!loading && plugins.length > 0 && TRUST_SECTIONS.every((s) => plugins.filter((p) => p.trust === s.trust && matches(p)).length === 0) && (
        <EmptyState
          icon={<MagnifyingGlass size={20} />}
          title="No plugins match"
          hint="Try a different search."
          action={
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setGroup("All");
              }}
              className="mt-1 px-3.5 py-1.5 rounded-full text-xs font-medium bg-[var(--overlay-strong)] text-[var(--text-main)] hover:bg-[var(--overlay-hover)] transition-colors cursor-pointer"
            >
              Clear search
            </button>
          }
        />
      )}
    </div>
  );
}

export function PluginsView({ onDismiss, className = "", initialTab = "installed", onOpenPlugin, lockTrust }: PluginsViewProps) {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"installed" | "discover">(initialTab);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginItem | null>(null);
  const [grants, setGrants] = useState<Array<{ grantId: string; permissionType: string; scope: string; status: string }>>([]);
  const [grantsBusy, setGrantsBusy] = useState(false);
  const [executions, setExecutions] = useState<Record<string, ExecutionRecord[]>>({});
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [connectingMcp, setConnectingMcp] = useState(false);
  const [mcpWarning, setMcpWarning] = useState<string | null>(null);
  const [mcpAcknowledged, setMcpAcknowledged] = useState(false);

  // Creations (#382): generated-only instead of a second Installed list.
  const visiblePlugins = lockTrust ? plugins.filter((p) => p.trust === lockTrust) : plugins;
  const isLocked = lockTrust !== undefined;

  // Client-side preview of exactly what connecting will grant (mirrors the
  // server install: net:hostname, mcp:server, plus a stored secret when a
  // token is given). Shown before connecting so the grant is explicit and
  // reviewable; revocation happens per-plugin via Uninstall.
  const mcpPreviewPermissions = (() => {
    try {
      const host = new URL(mcpUrl.trim()).hostname || mcpUrl.trim();
      if (!mcpUrl.trim()) return [];
      const perms: Array<{ type: string; label: string }> = [
        { type: "net", label: `Hosts: ${host}` },
        { type: "mcp", label: `Server: ${mcpUrl.trim()}` },
      ];
      if (mcpToken.trim()) perms.push({ type: "secret", label: "Secret: stored token" });
      return perms;
    } catch {
      return mcpUrl.trim() ? [{ type: "mcp", label: `Server: ${mcpUrl.trim()}` }] : [];
    }
  })();

  // Install from Manifest URL state — removed: remote-URL install is no longer
  // offered (security: unverified remote code must never execute in the
  // workspace). Plugins come from the curated store or the agent.
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPlugins = async () => {
    try {
      // Single request: last-run dots ride the list response (?withLastRun=1)
      // instead of one /executions call per plugin (devtools spam).
      const res = await fetch("/api/plugins?withLastRun=1");
      if (res.ok) {
        const data = await res.json();
        setPlugins(data.plugins || []);
        setExecutions((prev) => {
          const next = { ...prev };
          for (const p of data.plugins || []) {
            if (p.lastExecution && !next[p.id]?.length) next[p.id] = [p.lastExecution];
          }
          return next;
        });
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

  // Detail sheet data (grants + run history) loads on selection only:
  // the list dots come from ?withLastRun=1, so opening Tools costs a
  // bounded 2 requests instead of one /executions call per plugin.
  useEffect(() => {
    if (!selectedPlugin) {
      setGrants([]);
      return;
    }
    fetchExecutions(selectedPlugin.id);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/plugins/${encodeURIComponent(selectedPlugin.id)}/grants`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.grants)) setGrants(data.grants);
      } catch {
        // Grants are progressive enhancement; the sheet works without them.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPlugin?.id]);

  const handleRevokeGrant = async (grantId: string) => {
    if (grantsBusy) return;
    setGrantsBusy(true);
    try {
      const res = await fetch(`/api/plugins/grants/${encodeURIComponent(grantId)}/revoke`, { method: "POST" });
      if (!res.ok) throw new Error("Revoke failed.");
      setGrants((prev) => prev.filter((g) => g.grantId !== grantId));
    } catch {
      setActionError("Could not revoke that permission. Try again.");
    } finally {
      setGrantsBusy(false);
    }
  };

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
    if (!mcpAcknowledged) {
      setMcpError("Review the requested permissions below and confirm to connect.");
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
      setMcpAcknowledged(false);
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
            {isLocked ? "Creations" : "Plugins & Extensions"}
          </h2>
          <p className="text-xs text-white/50 font-sans mt-0.5">
            {isLocked
              ? "Built with the agent, mounted in your dock."
              : "Manage capabilities, system permissions, and external MCP servers."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMcpError(null);
              setMcpAcknowledged(false);
              setShowMcpModal(true);
            }}
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

      {/* Tabs: Installed + Discover (single-purpose locked pages skip the bar) */}
      {!isLocked && (
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
      )}

      {actionError && (
        <div className="w-full px-3.5 py-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-xs text-red-200/90">
          {actionError}
        </div>
      )}

      {activeTab === "discover" && !isLocked ? (
        <PluginStoreView onOpenPlugin={onOpenPlugin} />
      ) : (
        <InstalledPluginList
          plugins={visiblePlugins}
          loading={loading}
          executions={executions}
          selectedId={selectedPlugin?.id ?? null}
          onSelect={setSelectedPlugin}
          onToggle={handleToggle}
          onUninstall={handleUninstall}
          onOpenPlugin={onOpenPlugin}
          onBrowseLibrary={isLocked ? undefined : () => setActiveTab("discover")}
        />
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
              {resolveRowAction(selectedPlugin) === "open" && onOpenPlugin && (
                <button
                  type="button"
                  onClick={() => onOpenPlugin(selectedPlugin.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] hover:bg-[var(--accent-lime)]/25 transition-colors"
                >
                  <span>Open</span>
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

          {/* Requested permissions (static manifest declaration) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/70">Requested permissions:</span>
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

          {/* Granted access (live, revocable per permission) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/70">Granted access:</span>
            {grants.length === 0 ? (
              <span className="text-xs text-white/40">Nothing granted yet. First use asks once; uninstall removes everything.</span>
            ) : (
              grants.map((g) => (
                <div key={g.grantId} className="flex items-center justify-between gap-2 text-xs text-white/80">
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {g.permissionType}
                    {g.scope ? ` · ${g.scope}` : ""}
                  </span>
                  <button
                    type="button"
                    disabled={grantsBusy}
                    onClick={() => void handleRevokeGrant(g.grantId)}
                    className="shrink-0 text-white/40 hover:text-white hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              ))
            )}
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

              {/* Permission preview: the exact grant, before connecting */}
              {mcpPreviewPermissions.length > 0 && (
                <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
                  <span className="text-xs font-medium text-amber-200/90">
                    This server will be granted:
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {mcpPreviewPermissions.map((perm) => (
                      <span
                        key={perm.type}
                        className="inline-flex items-center gap-1.5 text-xs text-white/80 font-mono"
                      >
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {perm.type}
                        </span>
                        <span className="text-[11px] text-white/60 truncate">
                          {perm.label}
                        </span>
                      </span>
                    ))}
                  </div>
                  <label className="flex items-start gap-2 text-xs text-white/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mcpAcknowledged}
                      onChange={(e) => setMcpAcknowledged(e.target.checked)}
                      className="mt-0.5 accent-emerald-400"
                    />
                    <span>
                      I understand these permissions. I can revoke them anytime by uninstalling this server below.
                    </span>
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowMcpModal(false);
                    setMcpAcknowledged(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connectingMcp || !mcpAcknowledged}
                  title={!mcpAcknowledged ? "Review and confirm the permissions above first" : undefined}
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
