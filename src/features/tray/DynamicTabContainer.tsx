import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCircle, RefreshCw, Maximize2, Minimize2 } from "lucide-react";

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
      const res = await fetch(`/api/cities/${encodeURIComponent(cityId)}/tabs/${encodeURIComponent(tabId)}/srcdoc`);
      if (!res.ok) {
        throw new Error(`Failed to load feature tab "${tabId}" (HTTP ${res.status})`);
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

  // Handle postMessage communication with the sandboxed guest iframe
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Security check: only listen to messages from our own child iframe
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== "object" || !data.polymaxAction) {
        return;
      }

      const { polymaxAction, polymaxRequestId } = data;
      const respond = (result?: unknown, err?: string) => {
        iframeRef.current?.contentWindow?.postMessage(
          {
            polymaxResponseId: polymaxRequestId,
            result,
            error: err,
          },
          "*"
        );
      };

      try {
        switch (polymaxAction) {
          case "storage.get": {
            const storageKey = `polymax:${cityId}:${tabId}:${data.key}`;
            const item = localStorage.getItem(storageKey);
            respond(item ? JSON.parse(item) : null);
            break;
          }

          case "storage.set": {
            const storageKey = `polymax:${cityId}:${tabId}:${data.key}`;
            localStorage.setItem(storageKey, JSON.stringify(data.value));
            respond(true);
            break;
          }

          case "storage.remove": {
            const storageKey = `polymax:${cityId}:${tabId}:${data.key}`;
            localStorage.removeItem(storageKey);
            respond(true);
            break;
          }

          case "getContext": {
            respond({
              cityId,
              tabId,
              timestamp: new Date().toISOString(),
            });
            break;
          }

          case "openUrl": {
            if (typeof data.url === "string") {
              const url = data.url.trim();
              if (url.startsWith("http://") || url.startsWith("https://")) {
                window.open(url, "_blank", "noopener,noreferrer");
                respond(true);
              } else {
                respond(null, "Forbidden URL scheme");
              }
            } else {
              respond(null, "Invalid URL");
            }
            break;
          }

          case "submit": {
            if (typeof data.command === "string") {
              onSubmitCommand?.(data.command);
              respond(true);
            } else {
              respond(null, "Invalid command string");
            }
            break;
          }

          case "ui.expand": {
            onExpand?.();
            respond(true);
            break;
          }

          case "ui.collapse": {
            onCollapse?.();
            respond(true);
            break;
          }

          default:
            respond(null, `Unknown action "${polymaxAction}"`);
        }
      } catch (err: any) {
        respond(null, err?.message || String(err));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [cityId, tabId, onExpand, onCollapse, onSubmitCommand]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 bg-[#0A0A0C] border border-[#23232E] rounded-xl text-[#F0F0F5] ${className}`}>
        <AlertCircle className="w-8 h-8 text-[#FF5A5A] mb-3" />
        <h3 className="text-sm font-semibold mb-1">Failed to load feature tab</h3>
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
    <div className={`relative flex flex-col w-full h-full bg-[#0A0A0C] overflow-hidden ${className}`}>
      {/* Optional Topbar for expansion toggle */}
      {(onExpand || onCollapse) && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#23232E] bg-[#131318]/60 text-xs text-[#A0A0B0]">
          <span className="font-medium text-[#F0F0F5]">{title || tabId}</span>
          <button
            onClick={isExpanded ? onCollapse : onExpand}
            className="p-1 hover:text-[#C8FF57] transition-colors rounded"
            title={isExpanded ? "Collapse view" : "Expand to backdrop"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[#A0A0B0]">
          <RefreshCw className="w-4 h-4 animate-spin mr-2 text-[#C8FF57]" />
          Mounting feature sandbox…
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          srcDoc={srcdoc}
          title={title || `feature-${tabId}`}
          className="w-full h-full border-none flex-1 bg-transparent"
        />
      )}
    </div>
  );
}
