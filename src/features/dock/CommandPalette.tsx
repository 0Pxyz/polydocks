import { useState, useEffect, useCallback } from "react";
import {
  Sparkle,
  Terminal,
  PlugsConnected,
  Link,
  ShieldWarning,
  CheckCircle,
  XCircle,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";

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
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  cityId?: string;
  onOpenAgent?: () => void;
  onOpenInstallUrl?: () => void;
  onOpenMcpConnect?: () => void;
}

export function CommandPalette({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  cityId,
  onOpenAgent,
  onOpenInstallUrl,
  onOpenMcpConnect,
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = useCallback(
    (val: boolean) => {
      if (controlledOnOpenChange) {
        controlledOnOpenChange(val);
      } else {
        setInternalOpen(val);
      }
    },
    [controlledOnOpenChange]
  );

  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmingCap, setConfirmingCap] = useState<CapabilityItem | null>(null);
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    capabilityId: string;
    success: boolean;
    message: string;
  } | null>(null);

  // Global ⌘⇧P / Ctrl+Shift+P shortcut (⌘K is reserved for Agent conversation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setOpen(!isOpen);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setOpen]);

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

  useEffect(() => {
    if (isOpen) {
      fetchCapabilities();
      setLastResult(null);
      setConfirmingCap(null);
    }
  }, [isOpen, fetchCapabilities]);

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
    <CommandDialog
      open={isOpen}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Search and trigger capabilities across the agent runtime"
      className="bg-[#0b0d13] border border-white/10 text-white max-w-2xl shadow-2xl"
    >
      <CommandInput placeholder="Type a command, search capabilities, or install plugins (⌘K)..." />

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

      <CommandList className="max-h-[380px] p-2 text-white">
        <CommandEmpty className="py-6 text-center text-sm text-white/40">
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <ArrowsClockwise className="w-4 h-4 animate-spin text-white/50" />
              <span>Loading capabilities...</span>
            </div>
          ) : (
            "No matching capabilities found."
          )}
        </CommandEmpty>

        {/* Quick System Actions */}
        <CommandGroup heading="Actions & System">
          {onOpenAgent && (
            <CommandItem
              onSelect={() => {
                setOpen(false);
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
                setOpen(false);
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
                setOpen(false);
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

        <CommandSeparator className="my-1 bg-white/10" />

        {/* Dynamic Capabilities Grouped by Plugin */}
        {Object.entries(capabilitiesByPlugin).map(([pluginId, caps]) => (
          <CommandGroup key={pluginId} heading={`Plugin: ${pluginId}`}>
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
      </CommandList>
    </CommandDialog>
  );
}
