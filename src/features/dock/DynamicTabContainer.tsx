import { useEffect, useRef, useState, useCallback } from "react";
import { createHostBridge } from "./bridge/host-bridge";
import { ReaderView } from "./ReaderView";
import { cn } from "@/lib/cn";

export interface DynamicTabContainerProps {
  tabId: string;
  cityId: string;
  srcdoc?: string;
  title?: string;
  isExpanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  onSubmitCommand?: (command: string) => void;
  onAskAgentFix?: (errorMessage: string) => void;
  className?: string;
}

/**
 * Sandboxed iframe host for dynamic agent-mounted feature tabs.
 * Adheres strictly to docs/design-slop.md:
 * - Edge-to-edge transparent surface with no artificial borders or window headers
 * - Skeleton loading while awaiting compilation and bridge handshake (3s timeout)
 * - Quiet inline recovery status with reload and agent fix triggers
 */
export function DynamicTabContainer({
  tabId,
  cityId,
  srcdoc: controlledSrcdoc,
  title,
  onExpand,
  onCollapse,
  onSubmitCommand,
  onAskAgentFix,
  className = "",
}: DynamicTabContainerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcdoc, setSrcdoc] = useState<string>(controlledSrcdoc || "");
  const [fetching, setFetching] = useState<boolean>(!controlledSrcdoc);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [readerUrl, setReaderUrl] = useState<string | null>(null);
  const handshakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch compiled srcdoc from backend if not provided directly
  const fetchSrcdoc = useCallback(async () => {
    if (controlledSrcdoc) {
      setSrcdoc(controlledSrcdoc);
      setFetching(false);
      setError(null);
      return;
    }

    try {
      setFetching(true);
      setError(null);
      setIsReady(false);
      const res = await fetch(
        `/api/cities/${encodeURIComponent(cityId)}/tabs/${encodeURIComponent(tabId)}/srcdoc`
      );
      if (!res.ok) {
        throw new Error(`Failed to load ${title || tabId} (HTTP ${res.status})`);
      }
      const text = await res.text();
      setSrcdoc(text);
    } catch (err: any) {
      setError(err?.message || `Failed to load ${title || tabId}`);
    } finally {
      setFetching(false);
    }
  }, [cityId, tabId, controlledSrcdoc, title]);

  useEffect(() => {
    fetchSrcdoc();
  }, [fetchSrcdoc]);

  // Connect host postMessage bridge (openContent -> native Reader).
  // The target window is resolved at MESSAGE time from the iframe element
  // (not captured once at mount: the iframe only renders after the srcdoc
  // fetch resolves, so a mount-time capture is null forever and every reply
  // is dropped). Rebinding on srcdoc change keeps exactly one listener.
  useEffect(() => {
    const bridge = createHostBridge(() => iframeRef.current?.contentWindow ?? null, {
      cityId,
      tabId,
      onExpand,
      onCollapse,
      onSubmitCommand,
      onOpenContent: (url) => setReaderUrl(url),
      onReady: () => {
        if (handshakeTimerRef.current) {
          clearTimeout(handshakeTimerRef.current);
          handshakeTimerRef.current = null;
        }
        setIsReady(true);
      },
      onError: (err) => {
        setError(typeof err === "string" ? err : "Runtime error in tab");
      },
    });

    return () => {
      bridge.destroy();
    };
  }, [cityId, tabId, onExpand, onCollapse, onSubmitCommand, srcdoc]);

  // 3-second ready handshake timeout once srcdoc is mounted
  useEffect(() => {
    if (!srcdoc || fetching) return;

    handshakeTimerRef.current = setTimeout(() => {
      if (!isReady) {
        setIsReady(true);
      }
    }, 3000);

    return () => {
      if (handshakeTimerRef.current) {
        clearTimeout(handshakeTimerRef.current);
      }
    };
  }, [srcdoc, fetching, isReady]);

  const handleIframeLoad = () => {
    setIsReady(true);
  };

  const handleAskAgent = () => {
    const issue = error || `Tab ${title || tabId} did not respond to ready handshake.`;
    if (onAskAgentFix) {
      onAskAgentFix(issue);
    } else {
      window.dispatchEvent(
        new CustomEvent("polymax:submit-prompt", {
          detail: {
            prompt: `Fix tab "${title || tabId}": ${issue}`,
            origin: "dock-fix",
          },
        })
      );
    }
  };

  return (
    <div
      className={cn(
        "relative w-full h-full flex-1 flex flex-col bg-transparent select-none",
        className
      )}
    >
      {readerUrl ? (
        <ReaderView url={readerUrl} onBack={() => setReaderUrl(null)} />
      ) : (
        <>
      {/* Quiet Status Row on Failure or Timeout */}
      {error && (
        <div className="w-full flex items-center justify-center gap-2 py-3 text-xs text-[#9aa5b8] bg-transparent">
          <span>{error}</span>
          <span>·</span>
          <button
            type="button"
            onClick={fetchSrcdoc}
            className="text-[var(--accent-lime)] hover:underline cursor-pointer"
          >
            Reload
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={handleAskAgent}
            className="text-[var(--accent-lime)] hover:underline cursor-pointer"
          >
            Ask the agent to fix it
          </button>
        </div>
      )}

      {/* Skeleton Loading State */}
      {(fetching || (!isReady && !error)) && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-transparent text-[#9aa5b8] pointer-events-none"
          aria-live="polite"
        >
          <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-[var(--accent-lime)] animate-spin" />
          <span className="text-xs font-sans tracking-wide">
            Mounting {title || tabId}…
          </span>
        </div>
      )}

      {/* Edge-to-Edge Frameless Sandboxed Surface */}
      {srcdoc && (
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          srcDoc={srcdoc}
          title={title || `tab-${tabId}`}
          onLoad={handleIframeLoad}
          className={cn(
            "w-full h-full flex-1 border-0 bg-transparent transition-opacity duration-200",
            !isReady || error ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto"
          )}
        />
      )}
        </>
      )}
    </div>
  );
}
