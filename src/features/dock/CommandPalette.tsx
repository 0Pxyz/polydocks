import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Sparkle,
  Terminal,
  PlugsConnected,
  CheckCircle,
  XCircle,
  X,
  PushPin,
  Wrench,
  ArrowLeft,
  ColumnsPlusRight,
} from "@phosphor-icons/react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { resolveIcon } from "@/components/icons";
import { useDockStore } from "@/lib/store/useDockStore";
import { useNotesNavStore } from "@/lib/store/useNotesNavStore";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";
import {
  buildDockSections,
  createItemsForQuery,
  visibleEmptyQuery,
  capabilityNeedsInput,
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
  /** Session-created experiences (dynamic tabs) that are not in any store. */
  extraItems?: DockItem[];
  onOpenAgent?: () => void;
  onOpenMcpConnect?: () => void;
  /** Open a dock item: focus its tab. */
  onOpenItem?: (id: string) => void;
  /** Open a dock tool in the beside panel (no-op for ineligible rows). */
  onOpenBesideItem?: (id: string) => void;
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

const ROW_CLASS =
  "group flex w-full max-w-full items-center justify-between gap-2 min-h-10 pointer-coarse:min-h-11 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent-lime)]";

export function CommandPalette({
  extraItems = [],
  onOpenAgent,
  onOpenMcpConnect,
  onOpenItem,
  onOpenBesideItem,
  onCloseItem,
  onSubmitToolPrompt,
  onFixWithAgent,
  onClose,
}: CommandPaletteProps) {
  const closePalette = useCallback(() => onClose?.(), [onClose]);

  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    capabilityId: string;
    success: boolean;
    message: string;
  } | null>(null);

  const [query, setQuery] = useState("");
  const [deferredQuery, setDeferredQuery] = useState("");
  const [browseStore, setBrowseStore] = useState(false);
  const [storeItems, setStoreItems] = useState<DockItem[]>([]);
  const [noteItems, setNoteItems] = useState<Array<{ id: string; title: string }>>([]);
  const [failedIds, setFailedIds] = useState<Map<string, string>>(new Map());
  const [installingId, setInstallingId] = useState<string | null>(null);
  const modifierHeld = useRef(false);

  // Debounce the query so section ranking does not recompute per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDeferredQuery(query), 120);
    return () => clearTimeout(t);
  }, [query]);

  // Mirror UI pins to the server record (durable per-workspace truth).
  // Best-effort: the local pin already applied and stays on failure.
  const syncPinServer = useCallback((itemId: string, pinned: boolean) => {
    const wsId = useWorkspaceStore.getState().activeWorkspaceId || "default";
    const url = pinned
      ? `/api/workspaces/${encodeURIComponent(wsId)}/pins`
      : `/api/workspaces/${encodeURIComponent(wsId)}/pins/${encodeURIComponent(itemId)}`;
    void fetch(url, {
      method: pinned ? "POST" : "DELETE",
      headers: pinned ? { "Content-Type": "application/json" } : undefined,
      body: pinned ? JSON.stringify({ id: itemId }) : undefined,
    }).catch(() => {});
  }, []);

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

  // Notes for deep-link rows (#402): id + title only, filtered on query.
  // Best-effort like capabilities above — search still works without them.
  const fetchNoteItems = useCallback(async () => {
    try {
      const wsId = useWorkspaceStore.getState().activeWorkspaceId || "default";
      const res = await fetch("/api/plugins/notes/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: wsId }),
      });
      const json = await res.json().catch(() => null);
      const items = json?.ok && Array.isArray(json?.data?.items) ? json.data.items : [];
      setNoteItems(
        items
          .filter((n: any) => n && typeof n.id === "string")
          .map((n: any) => ({ id: n.id, title: typeof n.title === "string" && n.title ? n.title : "Untitled note" }))
      );
    } catch {
      setNoteItems([]);
    }
  }, []);

  // Fetch everything the dock can show: installed plugins,
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

    const [plugins, registry] = await Promise.all([
      pluginsPromise,
      storePromise,
    ]);

    const installedIds = new Set(plugins.map((wp) => wp.pluginId));

    setStoreItems(
      registry
        .filter((entry) => !installedIds.has(entry.id))
        .map((entry) => ({
          id: entry.id,
          label: entry.name,
          description: entry.description || "",
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
  }, []);

  const reload = useCallback(() => {
    void fetchCapabilities();
    void fetchNoteItems();
    void fetchDockData();
  }, [fetchCapabilities, fetchNoteItems, fetchDockData]);

  useEffect(() => {
    setLastResult(null);
    setQuery("");
    setDeferredQuery("");
    setBrowseStore(false);
    reload();
  }, [reload]);

  const catalog = useMemo<DockItem[]>(() => {
    const seen = new Set<string>();
    const merged: DockItem[] = [];
    for (const item of [...DOCK_CORE_CATALOG, ...extraItems]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    return merged;
  }, [extraItems]);

  const installedPluginItems = useMemo<DockItem[]>(
    () =>
      workspacePlugins
        .filter((wp) => wp.enabled && wp.plugin)
        .map((wp) => ({
          id: wp.pluginId,
          label: wp.plugin?.name || wp.pluginId,
          description: wp.plugin?.description || "",
          icon: wp.plugin?.icon || wp.pluginId,
          kind: "plugin" as DockItemKind,
        })),
    [workspacePlugins]
  );

  const fullCatalog = useMemo<DockItem[]>(
    () => [...catalog, ...installedPluginItems.filter((item) => !catalog.some((c) => c.id === item.id))],
    [catalog, installedPluginItems]
  );

  const trimmedQuery = deferredQuery.trim();
  const isEmptyQuery = trimmedQuery === "";

  const sections = useMemo(
    () =>
      buildDockSections({
        catalog: fullCatalog,
        store: storeItems,
        layout: { pinnedIds: pinnedToolIds, openIds },
        query: trimmedQuery,
        createForQuery: createItemsForQuery,
      }),
    [fullCatalog, storeItems, pinnedToolIds, openIds, trimmedQuery]
  );

  const pinnedSet = useMemo(() => new Set(pinnedToolIds), [pinnedToolIds]);
  const openSet = useMemo(() => new Set(openIds), [openIds]);

  const dockedItems = sections[0].items;
  const yoursItems = sections[1].items;
  const storeSectionItems = sections[2].items;

  // Empty query stays small: open items, then unpinned tools. No fake
  // "create" rows and no capability dump here; both appear only on search.
  const showBrowseRow = storeItems.length > 0;
  const emptySliced = useMemo(
    () =>
      visibleEmptyQuery({
        docked: dockedItems,
        yours: yoursItems,
        openIds,
        reserved: showBrowseRow ? 1 : 0,
      }),
    [dockedItems, yoursItems, openIds, showBrowseRow]
  );

  // Capabilities only rank on a real query; the empty panel stays dock-only.
  const capMatches = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q) return [];
    const matches = capabilities.filter((cap) =>
      `${cap.title} ${cap.id} ${cap.description} ${cap.pluginId}`.toLowerCase().includes(q)
    );
    return matches.slice(0, 8);
  }, [capabilities, trimmedQuery]);

  // Note deep links (#402): match on title, same open path as every other
  // entry point (requestNote + open the Notes surface).
  const noteMatches = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q) return [];
    return noteItems
      .filter((n) => n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
      .slice(0, 5);
  }, [noteItems, trimmedQuery]);

  const openNote = useCallback(
    (id: string) => {
      useNotesNavStore.getState().requestNote(id);
      closePalette();
      onOpenItem?.("notes");
    },
    [closePalette, onOpenItem]
  );

  const dockMatchCount = dockedItems.length + yoursItems.length + storeSectionItems.length;
  const showNoMatchRow =
    !isEmptyQuery && !browseStore && dockMatchCount === 0 && capMatches.length === 0 && noteMatches.length === 0;


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
          void syncPinServer(item.id, false);
        } else {
          pinTool(item.id);
          void syncPinServer(item.id, true);
        }
        return;
      }
      handlePrimaryAction(item);
    },
    [handlePrimaryAction, pinTool, pinnedSet, syncPinServer, unpinTool]
  );

  const togglePin = useCallback(
    (item: DockItem) => {
      if (pinnedSet.has(item.id)) {
        unpinTool(item.id);
        void syncPinServer(item.id, false);
      } else {
        pinTool(item.id);
        void syncPinServer(item.id, true);
      }
    },
    [pinTool, pinnedSet, syncPinServer, unpinTool]
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
    const canBeside =
      (item.kind === "builtin" || item.kind === "plugin" || item.kind === "tab") &&
      !item.system &&
      item.id !== "agent" &&
      item.id !== "maps";
    const showClose = openSet.has(item.id) && !item.system;
    return (
      <CommandItem
        key={`${item.kind}:${item.id}`}
        value={`${item.label} ${item.description} ${item.id}`}
        onSelect={() => handleSelectRow(item)}
        className={ROW_CLASS}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
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
          {canBeside && (
            <button
              type="button"
              onClick={() => {
                closePalette();
                onOpenBesideItem?.(item.id);
              }}
              title="Open beside"
              aria-label={`Open ${item.label} beside`}
              className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--accent-lime)]"
            >
              <ColumnsPlusRight className="w-3.5 h-3.5" />
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

  const renderCreateRow = (item: DockItem, valueSuffix?: string) => (
    <CommandItem
      key={item.id}
      value={`${item.label} ${item.description} ${valueSuffix ?? trimmedQuery}`}
      onSelect={() => handleSelectRow(item)}
      className={ROW_CLASS}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
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
  );

  const renderBrowseStoreRow = () => {
    const StoreIcon = resolveIcon("storefront");
    return (
      <CommandItem
        key="browse-store"
        value="browse store plugins"
        onSelect={() => setBrowseStore(true)}
        className={ROW_CLASS}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
          <StoreIcon className="w-4 h-4 shrink-0 text-white/50" weight="regular" />
          <div className="flex flex-col gap-0 min-w-0">
            <span className="text-sm text-white/95 truncate">Browse store</span>
            <span className="text-xs text-white/40 truncate">
              {storeItems.length} community {storeItems.length === 1 ? "plugin" : "plugins"}
            </span>
          </div>
        </div>
      </CommandItem>
    );
  };

  const renderBackRow = () => (
    <CommandItem
      key="back-all-tools"
      value="back to all tools"
      onSelect={() => setBrowseStore(false)}
      className={ROW_CLASS}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
        <ArrowLeft className="w-4 h-4 shrink-0 text-white/50" />
        <span className="text-sm text-white/95">All tools</span>
      </div>
    </CommandItem>
  );

  const renderNoMatchRow = () => (
    <CommandItem
      key="no-match-create"
      value={trimmedQuery}
      onSelect={() => {
        closePalette();
        onSubmitToolPrompt?.(`Create ${trimmedQuery}`);
      }}
      className={ROW_CLASS}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
        <Sparkle className="w-4 h-4 shrink-0 text-lime-400" weight="bold" />
        <div className="flex flex-col gap-0 min-w-0">
          <span className="text-sm text-white/95 truncate">No match. Ask the agent to create it</span>
          <span className="text-xs text-white/40 truncate">
            Create {trimmedQuery} with the agent
          </span>
        </div>
      </div>
      <Badge variant="outline">New</Badge>
    </CommandItem>
  );

  // Execute a capability: read-only without required params runs directly.
  // Anything else (write/destructive/external or needs input) delegates to
  // the agent, which owns approvals and follow-up questions.
  const executeCapability = async (cap: CapabilityItem) => {
    const needsAgent = cap.risk !== "read" || capabilityNeedsInput(cap.inputSchema);
    if (needsAgent) {
      closePalette();
      const reason =
        cap.risk !== "read" ? `risk ${cap.risk}` : "needs input";
      onSubmitToolPrompt?.(
        `Run ${cap.title} (${cap.id}) from ${cap.pluginId} [${reason}]: ${cap.description || "no description"}. Ask me for any required inputs.`
      );
      return;
    }

    setExecuting(true);
    try {
      const res = await fetch("/api/capabilities/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capabilityId: cap.id,
          input: {},
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

  // Group the filtered matches (never the full catalog) by pluginId.
  const capabilitiesByPlugin = capMatches.reduce<Record<string, CapabilityItem[]>>(
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
    <Command label="Dock search" className="w-full max-w-full overflow-hidden">
      <div
        onKeyDownCapture={(e) => {
          modifierHeld.current = e.metaKey || e.ctrlKey;
        }}
        onKeyUpCapture={(e) => {
          modifierHeld.current = e.metaKey || e.ctrlKey;
        }}
        className="[&_[data-slot=command-input-wrapper]]:h-11 [&_[data-slot=command-input-wrapper]]:border-b-0 [&_[data-slot=command-input-wrapper]_svg]:hidden"
      >
      <CommandInput
        autoFocus
        placeholder={installingId ? "Installing…" : "Search or add a tool"}
        onInput={(e) => setQuery(e.currentTarget.value)}
        className="text-[15px] placeholder:text-muted-foreground"
      />

      {/* Execution Feedback Notification */}
      {lastResult && (
        <div
          className={`px-4 py-2.5 border-b text-xs flex items-center justify-between ${
            lastResult.success
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-200"
              : "bg-red-950/40 border-red-500/30 text-red-200"
          }`}
          role={lastResult.success ? "status" : "alert"}
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

      {/*
        Radix wraps scroll content in a generated display:table div that
        sizes to content instead of the viewport, pushing badges out of
        view. Pin that wrapper to the viewport width so rows truncate.
      */}
      <ScrollArea className="max-h-[248px] [&_div:has(>[cmdk-list])]:w-full [&_div:has(>[cmdk-list])]:table-fixed [&_[cmdk-item][data-selected='true']]:bg-white/[0.08] [&_[cmdk-item][data-selected='true']]:text-white [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:bg-popover">
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

            {browseStore ? (
              <>
                {renderBackRow()}
                {storeSectionItems.length > 0 && (
                  <CommandGroup key="store" heading="Store">
                    {storeSectionItems.map((item) => renderDockRow(item))}
                  </CommandGroup>
                )}
              </>
            ) : isEmptyQuery ? (
              <>
                {emptySliced.open.length > 0 && (
                  <CommandGroup key="open" heading="Open now">
                    {emptySliced.open.map((item) => renderDockRow(item))}
                  </CommandGroup>
                )}
                {(emptySliced.yours.length > 0 || storeItems.length > 0) && (
                  <CommandGroup key="yours" heading="Your tools">
                    {emptySliced.yours.map((item) => renderDockRow(item))}
                    {showBrowseRow && renderBrowseStoreRow()}
                  </CommandGroup>
                )}
                {emptySliced.open.length === 0 && emptySliced.yours.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-white/40">
                    No tools yet. Type to search, browse the store, or ask the agent to build one.
                  </div>
                )}
              </>
            ) : showNoMatchRow ? (
              renderNoMatchRow()
            ) : (
              sections.map(
                (section) =>
                  section.items.length > 0 && (
                    <CommandGroup key={section.id} heading={section.title}>
                      {section.items.map((item) =>
                        item.kind === "create" ? renderCreateRow(item) : renderDockRow(item)
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
              {isEmptyQuery ? "No tools yet." : "No matches. Press Enter to ask the agent to build it."}
            </CommandEmpty>

            {/* Agent Capabilities: filtered matches only, grouped by plugin */}
            {!loading && !isEmptyQuery && noteMatches.length > 0 && (
              <CommandGroup key="notes" heading="Notes">
                {noteMatches.map((note) => (
                  <CommandItem
                    key={note.id}
                    value={`${note.title} ${note.id}`}
                    onSelect={() => openNote(note.id)}
                    className={ROW_CLASS}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
                      {(() => {
                        const Icon = resolveIcon("notes");
                        return <Icon className="w-4 h-4 shrink-0 text-white/50" weight="regular" />;
                      })()}
                      <div className="flex flex-col gap-0 min-w-0">
                        <span className="text-sm font-medium text-white/95 truncate">{note.title}</span>
                        <span className="text-[11px] text-white/40 truncate">Open in Notes</span>
                      </div>
                    </div>
                    <Badge variant="outline">Note</Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {Object.entries(capabilitiesByPlugin).map(([pluginId, caps]) => (
              <CommandGroup key={pluginId} heading={`Capabilities · ${pluginId}`}>
                {caps.map((cap) => {
                  const needsAgent = cap.risk !== "read" || capabilityNeedsInput(cap.inputSchema);
                  return (
                  <CommandItem
                    key={cap.id}
                    value={`${cap.title} ${cap.id} ${cap.description} ${pluginId}`}
                    onSelect={() => executeCapability(cap)}
                    disabled={executing}
                    className="group flex w-full max-w-full items-center justify-between gap-2 py-2.5 px-3 rounded-lg hover:bg-white/10 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent-lime)]"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
                      <div className="flex items-center gap-2 min-w-0">
                        <Terminal className="w-3.5 h-3.5 text-white/50 shrink-0" />
                        <span className="text-sm font-medium text-white/95 truncate" title={cap.title}>
                          {cap.title}
                        </span>
                        {needsAgent && (
                          <span className="text-[10px] text-white/40 shrink-0">→ Agent</span>
                        )}
                      </div>
                      {cap.description && (
                        <span className="text-xs text-white/40 truncate pl-5.5" title={cap.description}>
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
                  );
                })}
              </CommandGroup>
            ))}

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
      </div>
    </Command>
  );
}
