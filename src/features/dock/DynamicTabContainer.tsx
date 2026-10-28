import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCircle, RefreshCw, Maximize2, Minimize2 } from "lucide-react";
import { createHostBridge } from "./bridge/host-bridge";

export interface DynamicTabContainerProps {
  tabId: string;
  cityId: string;
  srcdoc?: string;
  title?: string;
  isExpanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  onSubmitCommand?: (command: string) => void;
  className?: string;
}

/**
 * Sandboxed iframe host for dynamic agent-mounted feature tabs.
 * Enforces strict isolation (sandbox="allow-scripts") and mediates the
 * polymax.* postMessage guest bridge.
 */
export function DynamicTabContainer({
  tabId,
  cityId,
  srcdoc: controlledSrcdoc,
  title,
  isExpanded,
  onExpand,
  onCollapse,
  onSubmitCommand,
  className = "",
}: DynamicTabContainerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcdoc, setSrcdoc] = useState<string>(controlledSrcdoc || "");
  const [loading, setLoading] = useState<boolean>(!controlledSrcdoc);
  const [error, setError] = useState<string | null>(null);

  // Fetch compiled srcdoc from backend if not provided directly
  const fetchSrcdoc = useCallback(async () => {
    if (controlledSrcdoc) {
      setSrcdoc(controlledSrcdoc);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/cities/${encodeURIComponent(cityId)}/tabs/${encodeURIComponent(tabId)}/srcdoc`
      );
      if (!res.ok) {
        throw new Error(`Failed to load dynamic tab "${tabId}" (HTTP ${res.status})`);
      }
      const text = await res.text();
      setSrcdoc(text);
    } catch (err: any) {
      setError(err?.message || "Failed to load tab payload");
    } finally {
      setLoading(false);
    }
  }, [cityId, tabId, controlledSrcdoc]);

  useEffect(() => {
    fetchSrcdoc();
  }, [fetchSrcdoc]);

  // Connect host postMessage bridge
  useEffect(() => {
    const targetWin = iframeRef.current?.contentWindow || null;
    const bridge = createHostBridge(targetWin, {
      cityId,
      tabId,
      onExpand,
      onCollapse,
      onSubmitCommand,
    });

    return () => {
      bridge.destroy();
    };
  }, [cityId, tabId, onExpand, onCollapse, onSubmitCommand]);

  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 bg-[#0A0A0C] border border-[#23232E] rounded-xl text-[#F0F0F5] ${className}`}
      >
        <AlertCircle className="w-8 h-8 text-[#FF5A5A] mb-3" />
        <h3 className="text-sm font-semibold mb-1">Failed to load dynamic tab</h3>
        <p className="text-xs text-[#A0A0B0] mb-4 text-center max-w-sm">{error}</p>
        <button
          onClick={fetchSrcdoc}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131318] hover:bg-[#1C1C24] border border-[#23232E] hover:border-[#C8FF57] rounded-lg text-xs font-medium transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col w-full h-full bg-[#0A0A0C] overflow-hidden ${className}`}
    >
      {(onExpand || onCollapse) && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#23232E] bg-[#131318]/60 text-xs text-[#A0A0B0]">
          <span className="font-medium text-[#F0F0F5]">{title || tabId}</span>
          <button
            onClick={isExpanded ? onCollapse : onExpand}
            className="p-1 hover:text-[#C8FF57] transition-colors rounded"
            title={isExpanded ? "Collapse view" : "Expand to backdrop"}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[#A0A0B0]">
          <RefreshCw className="w-4 h-4 animate-spin mr-2 text-[#C8FF57]" />
          Mounting tab sandbox…
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          srcDoc={srcdoc}
          title={title || `tab-${tabId}`}
          className="w-full h-full border-none flex-1 bg-transparent"
        />
      )}
    </div>
  );
}
