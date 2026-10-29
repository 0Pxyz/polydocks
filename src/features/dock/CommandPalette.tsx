import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Sparkle,
  Terminal,
  PlugsConnected,
  Link,
  ShieldWarning,
  CheckCircle,
  XCircle,
  X,
  PushPin,
  Wrench,
} from "@phosphor-icons/react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { resolveIcon } from "@/components/icons";
import { useDockStore } from "@/lib/store/useDockStore";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";
import {
  buildDockSections,
  createItemsForQuery,
  DOCK_CORE_CATALOG,
  type DockItem,
  type DockItemKind,
} from "@/lib/dock/dockModel";

export interface CapabilityItem {
  id: string;
  pluginId: string;
  title: string;
  description: string;
  risk: "read" | "write" | "destructive" | "external";
  inputSchema?: any;
  outputSchema?: any;
}

interface CommandPaletteProps {
  cityId?: string;
  /** Session-created experiences (dynamic tabs) that are not in any store. */
  extraItems?: DockItem[];
  onOpenAgent?: () => void;
  onOpenInstallUrl?: () => void;
  onOpenMcpConnect?: () => void;
  /** Open a dock item: focus its tab. */
  onOpenItem?: (id: string) => void;
  /** Close a dock tab (never deletes). */
  onCloseItem?: (id: string) => void;
  /** Submit a "create with agent" prompt. */
  onSubmitToolPrompt?: (prompt: string) => void;
  /** Send a fix prompt to the agent for a failed plugin. */
  onFixWithAgent?: (prompt: string) => void;
  /** Close the panel (the dock X button owns this too). */
  onClose?: () => void;
}

interface RegistryEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const KIND_BADGE: Record<DockItemKind, string> = {
  builtin: "Installed",
  plugin: "Installed",
  tab: "Installed",
  store: "Store",
  create: "New",
};

export function CommandPalette({
  cityId,
  extraItems = [],
  onOpenAgent,
  onOpenInstallUrl,
  onOpenMcpConnect,
  onOpenItem,
  onCloseItem,
  onSubmitToolPrompt,
  onFixWithAgent,
  onClose,
}: CommandPaletteProps) {
  const closePalette = useCallback(() => onClose?.(), [onClose]);

  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [confirmingCap, setConfirmingCap] = useState<CapabilityItem | null>(null);
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    capabilityId: string;
    success: boolean;
    message: string;
  } | null>(null);

  const [query, setQuery] = useState("");
  const [tabItems, setTabItems] = useState<DockItem[]>([]);
  const [storeItems, setStoreItems] = useState<DockItem[]>([]);
  const [failedIds, setFailedIds] = useState<Map<string, string>>(new Map());
  const [installingId, setInstallingId] = useState<string | null>(null);
  const modifierHeld = useRef(false);

  const pinnedToolIds = useDockStore((s) => s.pinnedToolIds);
  const openIds = useDockStore((s) => s.openIds);
  const pinTool = useDockStore((s) => s.pinTool);
  const unpinTool = useDockStore((s) => s.unpinTool);
  const closeTool = useDockStore((s) => s.closeTool);
  const workspacePlugins = useWorkspaceStore((s) => s.workspacePlugins);

  // The panel mounts only while open, so the ⌘⇧P shortcut lives in the
  // always-mounted dock. Fetch once per mount.

  // Fetch capabilities when palette opens
  const fetchCapabilities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/capabilities?enabled=true");
      if (res.ok) {
        const data = await res.json();
        setCapabilities(data.capabilities || []);
      }
    } catch (err) {
      console.error("Failed to fetch capabilities:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch everything the dock can show: installed plugins, city tabs,
  // community store plugins, and recorded failures for installed plugins.
  const fetchDockData = useCallback(async () => {
    setLoadError(false);
    const workspaceId =
      useWorkspaceStore.getState().activeWorkspaceId || "default";

    const pluginsPromise = (async () => {
      try {
        await useWorkspaceStore.getState().fetchWorkspacePlugins(workspaceId);
        return useWorkspaceStore.getState().workspacePlugins;
      } catch {
        setLoadError(true);
        return [];
      }
    })();

    const tabsPromise = (async (): Promise<DockItem[]> => {
      if (!cityId) return [];
      try {
        const res = await fetch(`/api/cities/${encodeURIComponent(cityId)}/tabs`);
        if (!res.ok) return [];
        const json = await res.json();
        const tabs = Array.isArray(json.data) ? json.data : [];
        return tabs.map((tab: { id: string; title?: string; icon?: string }) => ({
          id: tab.id,
          label: tab.title || tab.id,
          description: "City tab",
          icon: tab.icon || tab.id,
          kind: "tab" as DockItemKind,
        }));
      } catch {
        return [];
      }
    })();

    const storePromise = (async (): Promise<RegistryEntry[]> => {
      try {
        const res = await fetch("/api/registry");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return Array.isArray(json.data) ? json.data : [];
      } catch {
        setLoadError(true);
        return [];
      }
    })();

    const [plugins, tabs, registry] = await Promise.all([
      pluginsPromise,
      tabsPromise,
      storePromise,
    ]);

    const installedIds = new Set(plugins.map((wp) => wp.pluginId));

    setTabItems(tabs);
    setStoreItems(
      registry
        .filter((entry) => !installedIds.has(entry.id))
        .map((entry) => ({
          id: entry.id,
          label: entry.name,
          description: entry.description || "Community plugin",
          icon: entry.icon || entry.id,
          kind: "store" as DockItemKind,
        }))
    );

    // Recorded failures surface as normal rows with a fix action instead of
    // overlapping error banners.
    try {
      const failures = await Promise.all(
        plugins.map(async (wp) => {
          try {
            const res = await fetch(`/api/experiences/${encodeURIComponent(wp.pluginId)}/errors`);
            if (!res.ok) return null;
            const json = await res.json();
            const errors = Array.isArray(json.errors) ? json.errors : Array.isArray(json.data) ? json.data : [];
            if (errors.length === 0) return null;
            const first = errors[0];
            const message =
              typeof first?.message === "string" ? first.message : "Failed to load.";
            return [wp.pluginId, message] as [string, string];
          } catch {
            return null;
          }
        })
      );
      setFailedIds(new Map(failures.filter((row): row is [string, string] => row !== null)));
    } catch {
      // Failure metadata is best-effort; rows still render without it.
    }
  }, [cityId]);

  const reload = useCallback(() => {
    void fetchCapabilities();
    void fetchDockData();
  }, [fetchCapabilities, fetchDockData]);

  useEffect(() => {
    setLastResult(null);
    setConfirmingCap(null);
    setQuery("");
    reload();
  }, [reload]);

  const catalog = useMemo<DockItem[]>(() => {
    const seen = new Set<string>();
    const merged: DockItem[] = [];
    for (const item of [...DOCK_CORE_CATALOG, ...tabItems, ...extraItems]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    return merged;
  }, [tabItems, extraItems]);

  const installedPluginItems = useMemo<DockItem[]>(
    () =>
      workspacePlugins
        .filter((wp) => wp.enabled && wp.plugin)
        .map((wp) => ({
          id: wp.pluginId,
          label: wp.plugin?.name || wp.pluginId,
          description: wp.plugin?.description || "Installed workspace plugin",
          icon: wp.plugin?.icon || wp.pluginId,
          kind: "plugin" as DockItemKind,
        })),
    [workspacePlugins]
  );

  const fullCatalog = useMemo<DockItem[]>(
    () => [...catalog, ...installedPluginItems.filter((item) => !catalog.some((c) => c.id === item.id))],
    [catalog, installedPluginItems]
  );

  const sections = useMemo(
    () =>
      buildDockSections({
        catalog: fullCatalog,
        store: storeItems,
        layout: { pinnedIds: pinnedToolIds, openIds },
        query,
        createForQuery: createItemsForQuery,
      }),
    [fullCatalog, storeItems, pinnedToolIds, openIds, query]
  );

  const pinnedSet = useMemo(() => new Set(pinnedToolIds), [pinnedToolIds]);
  const openSet = useMemo(() => new Set(openIds), [openIds]);

  const visibleRowCount = sections.reduce((count, section) => count + section.items.length, 0);


  const handlePrimaryAction = useCallback(
    (item: DockItem) => {
      if (item.kind === "store") {
        void (async () => {
          const workspaceId =
            useWorkspaceStore.getState().activeWorkspaceId || "default";
          setInstallingId(item.id);
          try {
            const res = await fetch(
              `/api/registry/${encodeURIComponent(item.id)}/install`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceId }),
              }
            );
            if (res.ok) {
              await useWorkspaceStore.getState().fetchWorkspacePlugins(workspaceId);
              await fetchDockData();
              closePalette();
              onOpenItem?.(item.id);
            }
          } finally {
            setInstallingId(null);
          }
        })();
        return;
      }
      if (item.kind === "create") {
        closePalette();
        onSubmitToolPrompt?.(item.label);
        return;
      }
      closePalette();
      onOpenItem?.(item.id);
    },
    [closePalette, fetchDockData, onOpenItem, onSubmitToolPrompt]
  );

  const handleSelectRow = useCallback(
    (item: DockItem) => {
      // ⌘/Ctrl+Enter pins instead of opening.
      if (modifierHeld.current && (item.kind === "builtin" || item.kind === "plugin" || item.kind === "tab") && !item.system) {
        if (pinnedSet.has(item.id)) {
          unpinTool(item.id);
        } else {
          pinTool(item.id);
        }
        return;
      }
      handlePrimaryAction(item);
    },
    [handlePrimaryAction, pinTool, pinnedSet, unpinTool]
  );

  const togglePin = useCallback(
    (item: DockItem) => {
      if (pinnedSet.has(item.id)) {
        unpinTool(item.id);
      } else {
        pinTool(item.id);
      }
    },
    [pinTool, pinnedSet, unpinTool]
  );

  const handleCloseRow = useCallback(
    (item: DockItem) => {
      closeTool(item.id);
      onCloseItem?.(item.id);
    },
    [closeTool, onCloseItem]
  );

  const handleFixRow = useCallback(
    (item: DockItem) => {
      const message = failedIds.get(item.id) || "Failed to load.";
      closePalette();
      onFixWithAgent?.(`Fix tool "${item.id}": ${message}`);
    },
    [closePalette, failedIds, onFixWithAgent]
  );

  const renderBadge = (item: DockItem) => {
    if (failedIds.has(item.id)) {
      return <Badge variant="destructive">Needs fix</Badge>;
    }
    if (openSet.has(item.id)) {
      return <Badge variant="secondary">Open</Badge>;
    }
    return <Badge variant="outline">{KIND_BADGE[item.kind]}</Badge>;
  };

  const isPinned = (item: DockItem) => pinnedSet.has(item.id);

  const renderDockRow = (item: DockItem) => {
    const Icon = resolveIcon(item.icon);
    const failed = failedIds.has(item.id);
    const pinned = isPinned(item);
    const canPin = (item.kind === "builtin" || item.kind === "plugin" || item.kind === "tab") && !item.system;
    const showClose = openSet.has(item.id) && !item.system;
    return (
      <CommandItem
        key={`${item.kind}:${item.id}`}
        value={`${item.label} ${item.description} ${item.id}`}
        onSelect={() => handleSelectRow(item)}
        className="group flex items-center justify-between gap-2 min-h-10 pointer-coarse:min-h-11 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent-lime)]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon className="w-4 h-4 shrink-0 text-white/50" weight="regular" />
          <div className="flex flex-col gap-0 min-w-0">
            <span className="text-sm text-white/95 truncate" title={item.label}>{item.label}</span>
            {item.description && (
              <span className="text-xs text-white/40 truncate" title={item.description}>{item.description}</span>
            )}
            {failed && (
              <span className="text-xs text-red-300/80 truncate">
                {failedIds.get(item.id)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {renderBadge(item)}
          {canPin && (
            <button
              type="button"
              onClick={() => togglePin(item)}
              title={pinned ? "Unpin from dock" : "Pin to dock"}
              aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
              className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--accent-lime)]"
            >
              <PushPin className="w-3.5 h-3.5" weight={pinned ? "fill" : "regular"} />
            </button>
          )}
          {showClose && (
            <button
              type="button"
              onClick={() => handleCloseRow(item)}
              title="Close tab"
              aria-label={`Close ${item.label}`}
              className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent-lime)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {failed && (
            <button
              type="button"
              onClick={() => handleFixRow(item)}
              title="Fix with agent"
              aria-label={`Fix ${item.label} with agent`}
              className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent-lime)]"
            >
              <Wrench className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </CommandItem>
    );
  };

  // Execute a capability
  const executeCapability = async (cap: CapabilityItem) => {
    // If destructive or external, require confirmation first
    if ((cap.risk === "destructive" || cap.risk === "external") && !confirmingCap) {
      setConfirmingCap(cap);
      return;
    }

    setExecuting(true);
    setConfirmingCap(null);
    try {
      const res = await fetch("/api/capabilities/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capabilityId: cap.id,
          input: {},
          cityId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLastResult({
          capabilityId: cap.id,
          success: true,
          message: typeof data.data === "string" ? data.data : `Executed ${cap.title} successfully.`,
        });
      } else {
        setLastResult({
          capabilityId: cap.id,
          success: false,
          message: data.error || `Failed to execute ${cap.title}.`,
        });
      }
    } catch (err: any) {
      setLastResult({
        capabilityId: cap.id,
        success: false,
        message: err.message || "Network execution error",
      });
    } finally {
      setExecuting(false);
    }
  };

  // Group capabilities by pluginId
  const capabilitiesByPlugin = capabilities.reduce<Record<string, CapabilityItem[]>>(
    (acc, cap) => {
      const group = cap.pluginId || "other";
      if (!acc[group]) acc[group] = [];
      acc[group].push(cap);
      return acc;
    },
    {}
  );

  const getRiskBadge = (risk: CapabilityItem["risk"]) => {
    switch (risk) {
      case "destructive":
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
            destructive
          </span>
        );
      case "external":
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            external
          </span>
        );
      case "write":
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            write
          </span>
        );
      case "read":
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-white/10 text-white/70 border border-white/10">
            read
          </span>
        );
    }
  };

  return (
    <Command label="Dock search">
      <div
        onKeyDownCapture={(e) => {
          modifierHeld.current = e.metaKey || e.ctrlKey;
        }}
        onKeyUpCapture={(e) => {
          modifierHeld.current = e.metaKey || e.ctrlKey;
        }}
      >
      <CommandInput
        autoFocus
        placeholder="Search tools, tabs and plugins…"
        onInput={(e) => setQuery(e.currentTarget.value)}
      />

      {/* Confirmation Step for Destructive or External Actions */}
      {confirmingCap && (
        <div className="p-4 bg-amber-950/40 border-b border-amber-500/30 flex items-start gap-3">
          <ShieldWarning className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" weight="bold" />
          <div className="flex-1 text-xs">
            <p className="font-semibold text-amber-200">
              Confirm Action: {confirmingCap.title}
            </p>
            <p className="text-amber-300/80 mt-0.5">
              This capability has risk level <span className="uppercase font-mono font-bold">{confirmingCap.risk}</span>.
              Are you sure you want to proceed with execution?
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => executeCapability(confirmingCap)}
                disabled={executing}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded text-xs transition-colors"
              >
                {executing ? "Executing..." : "Confirm Execution"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCap(null)}
                className="px-3 py-1 bg-white/10 hover:bg-white/15 text-white rounded text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Feedback Notification */}
      {lastResult && (
        <div
          className={`px-4 py-2.5 border-b text-xs flex items-center justify-between ${
            lastResult.success
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-200"
              : "bg-red-950/40 border-red-500/30 text-red-200"
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {lastResult.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" weight="bold" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 shrink-0" weight="bold" />
            )}
            <span className="truncate">{lastResult.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setLastResult(null)}
            className="text-white/40 hover:text-white text-xs ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <ScrollArea className="max-h-[248px] [&_[cmdk-item][data-selected='true']]:bg-white/[0.08] [&_[cmdk-item][data-selected='true']]:text-white [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:bg-popover">
      <CommandList className="max-h-none overflow-visible p-2 text-white">
        {loading ? (
          <div className="flex flex-col gap-2 p-2" aria-label="Loading tools">
            <Skeleton className="h-12 w-full bg-white/5" />
            <Skeleton className="h-12 w-full bg-white/5" />
            <Skeleton className="h-12 w-full bg-white/5" />
          </div>
        ) : (
          <>
            {loadError && (
              <div className="flex items-center justify-between px-3 py-2 text-xs text-white/60">
                <span>Some tools could not load.</span>
                <button
                  type="button"
                  onClick={reload}
                  className="text-white hover:underline cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {visibleRowCount === 0 ? (
              <div className="py-6 text-center text-sm text-white/40">
                No tools match your search.
              </div>
            ) : (
              sections.map(
                (section) =>
                  section.items.length > 0 && (
                    <CommandGroup key={section.id} heading={section.title}>
                      {section.items.map((item) =>
                        item.kind === "create" ? (
                          <CommandItem
                            key={item.id}
                            value={`${item.label} ${item.description} ${query}`}
                            onSelect={() => handleSelectRow(item)}
                            className="group flex items-center justify-between gap-2 min-h-10 pointer-coarse:min-h-11 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent-lime)]"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Sparkle className="w-4 h-4 shrink-0 text-lime-400" weight="bold" />
                              <div className="flex flex-col gap-0 min-w-0">
                                <span className="text-sm text-white/95 truncate" title={item.label}>
                                  {item.label}
                                </span>
                                <span className="text-xs text-white/40 truncate" title={item.description}>
                                  {item.description}
                                </span>
                              </div>
                            </div>
                            <Badge variant="outline">New</Badge>
                          </CommandItem>
                        ) : (
                          renderDockRow(item)
                        )
                      )}
                    </CommandGroup>
                  )
              )
            )}
          </>
        )}

        {!loading && (
          <>
            <CommandEmpty className="py-6 text-center text-sm text-white/40">
              No matching capabilities found.
            </CommandEmpty>

            {/* Agent Capabilities */}
            {Object.entries(capabilitiesByPlugin).map(([pluginId, caps]) => (
              <CommandGroup key={pluginId} heading={`Capabilities · ${pluginId}`}>
                {caps.map((cap) => (
                  <CommandItem
                    key={cap.id}
                    value={`${cap.title} ${cap.id} ${cap.description} ${pluginId}`}
                    onSelect={() => executeCapability(cap)}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
                  >
                    <div className="flex flex-col gap-0.5 max-w-[75%]">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-white/50 shrink-0" />
                        <span className="text-sm font-medium text-white/95 truncate">
                          {cap.title}
                        </span>
                      </div>
                      {cap.description && (
                        <span className="text-xs text-white/40 truncate pl-5.5">
                          {cap.description}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {getRiskBadge(cap.risk)}
                      <span className="text-[11px] font-mono text-white/30 truncate max-w-[100px]">
                        {cap.id}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            <CommandSeparator className="my-1 bg-white/10" />

            {/* Quick System Actions */}
            <CommandGroup heading="Actions & System">
              {onOpenAgent && (
                <CommandItem
                  onSelect={() => {
                    closePalette();
                    onOpenAgent();
                  }}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/10 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkle className="w-4 h-4 text-lime-400" weight="bold" />
                    <span className="text-sm font-medium">Open Agent Conversation</span>
                  </div>
                  <span className="text-[10px] font-mono text-white/40">⌘K</span>
                </CommandItem>
              )}

              {onOpenInstallUrl && (
                <CommandItem
                  onSelect={() => {
                    closePalette();
                    onOpenInstallUrl();
                  }}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/10 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Link className="w-4 h-4 text-sky-400" weight="bold" />
                    <span className="text-sm font-medium">Install Plugin from Manifest URL...</span>
                  </div>
                  <span className="text-[10px] font-mono text-white/40">URL</span>
                </CommandItem>
              )}

              {onOpenMcpConnect && (
                <CommandItem
                  onSelect={() => {
                    closePalette();
                    onOpenMcpConnect();
                  }}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/10 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <PlugsConnected className="w-4 h-4 text-purple-400" weight="bold" />
                    <span className="text-sm font-medium">Connect External MCP Server...</span>
                  </div>
                  <span className="text-[10px] font-mono text-white/40">MCP</span>
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[11px] text-white/40">
        <span>Enter opens · ⌘↵ pins · Esc closes</span>
        {installingId && <span>Installing…</span>}
      </div>
      </div>
    </Command>
  );
}
