import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCircle, RefreshCw, X } from "lucide-react";
import { createHostBridge } from "./bridge/host-bridge";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";

export interface DynamicPluginSandboxProps {
  pluginId: string;
  workspaceId?: string;
  title?: string;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Sandboxed iframe host for PolyDocks V2 dynamic plugins.
 * Enforces strict sandbox boundaries (sandbox="allow-scripts"), scoped localStorage keys,
 * and seamless integration with the host agentic dock surface.
 */
export function DynamicPluginSandbox({
  pluginId,
  workspaceId: explicitWorkspaceId,
  title,
  onDismiss,
  className = "",
}: DynamicPluginSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeWsId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaceId = explicitWorkspaceId || activeWsId || "default";

  const [srcdoc, setSrcdoc] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSrcdoc = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/plugins/${encodeURIComponent(
          pluginId
        )}/srcdoc`
      );
      if (!res.ok) {
        throw new Error(`Failed to load plugin "${pluginId}" (HTTP ${res.status})`);
      }
      const text = await res.text();
      setSrcdoc(text);
    } catch (err: any) {
      setError(err?.message || "Failed to load plugin payload");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, pluginId]);

  useEffect(() => {
    fetchSrcdoc();
  }, [fetchSrcdoc]);

  // Connect host postMessage bridge scoped to workspace + plugin
  useEffect(() => {
    const targetWin = iframeRef.current?.contentWindow || null;
    const bridge = createHostBridge(targetWin, {
      cityId: workspaceId,
      tabId: pluginId,
      workspaceId,
      pluginId,
      storagePrefix: "polydocks",
      onCollapse: onDismiss,
    });

    return () => {
      bridge.destroy();
    };
  }, [workspaceId, pluginId, onDismiss]);

  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 bg-[#0A0A0C] border border-[#23232E] rounded-2xl text-[#F0F0F5] ${className}`}
      >
        <AlertCircle className="w-8 h-8 text-[#FF5A5A] mb-3" />
        <h3 className="text-sm font-semibold mb-1">Failed to load plugin</h3>
        <p className="text-xs text-[#A0A0B0] mb-4 text-center max-w-sm">{error}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSrcdoc}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131318] hover:bg-[#1C1C24] border border-[#23232E] hover:border-[#C8FF57] rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-[#9aa5b8] hover:text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col w-full h-[calc(100vh-140px)] min-h-[500px] max-w-5xl mx-auto bg-[#0A0A0C] rounded-2xl border border-white/10 overflow-hidden shadow-2xl ${className}`}
    >
      {/* Sleek Minimal Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.08] bg-[#131318]/70 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-lime)] animate-pulse" />
          <span className="font-semibold text-xs text-white tracking-wide">
            {title || pluginId}
          </span>
          <span className="text-[10px] text-[#9aa5b8] font-mono px-1.5 py-0.5 rounded bg-white/[0.05]">
            PolyDocks
          </span>
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded-md text-[#9aa5b8] hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            aria-label="Close plugin surface"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-xs text-[#9aa5b8] gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-[var(--accent-lime)]" />
          <span>Mounting plugin sandbox…</span>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          srcDoc={srcdoc}
          title={title || `plugin-${pluginId}`}
          className="w-full h-full border-none flex-1 bg-transparent"
        />
      )}
    </div>
  );
}
