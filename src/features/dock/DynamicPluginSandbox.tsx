import { useEffect, useRef, useState, useCallback } from "react";
import { createHostBridge } from "./bridge/host-bridge";
import { ReaderView } from "./ReaderView";
import { TaskNotice } from "./TaskNotice";
import { useTabHostStore } from "@/lib/tabs/tabHostStore";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";
import { useThemeStore } from "@/lib/theme";
import { cn } from "@/lib/cn";

export interface DynamicPluginSandboxProps {
  pluginId: string;
  workspaceId?: string;
  title?: string;
  onDismiss?: () => void;
  onAskAgentFix?: (errorMessage: string) => void;
  className?: string;
}

/**
 * Sandboxed iframe host for dynamic dock experiences.
 * Adheres strictly to internal-docs/design-slop.md:
 * - Edge-to-edge transparent surface with no artificial borders or window headers
 * - Skeleton loading while awaiting compilation and bridge handshake (3s timeout)
 * - Quiet inline recovery status with reload and agent fix triggers
 */
export function DynamicPluginSandbox({
  pluginId,
  workspaceId: explicitWorkspaceId,
  title,
  onDismiss,
  onAskAgentFix,
  className = "",
}: DynamicPluginSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeWsId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaceId = explicitWorkspaceId || activeWsId || "default";

  const [srcdoc, setSrcdoc] = useState<string>("");
  const [fetching, setFetching] = useState<boolean>(true);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [readerUrl, setReaderUrl] = useState<string | null>(null);
  const handshakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bridgeRef = useRef<{ pushTheme: (theme: string) => void } | null>(null);
  // New builds post `polymaxAction: "ui.ready"` after mounting (see
  // buildFeatureSrcdoc/buildReactSrcdoc). Only those get strict timeout
  // behavior; legacy srcdocs keep the lenient auto-reveal below.
  const requiresReadyRef = useRef(false);

  const fetchSrcdoc = useCallback(async () => {
    try {
      setFetching(true);
      setError(null);
      setIsReady(false);
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/plugins/${encodeURIComponent(
          pluginId
        )}/srcdoc`
      );
      if (!res.ok) {
        throw new Error(`Failed to load ${title || pluginId} (HTTP ${res.status})`);
      }
      const text = await res.text();
      requiresReadyRef.current =
        text.includes('polymaxAction: "ui.ready"') || text.includes("polymaxAction: 'ui.ready'");
      setSrcdoc(text);
    } catch (err: any) {
      setError(err?.message || `Failed to load ${title || pluginId}`);
    } finally {
      setFetching(false);
    }
  }, [workspaceId, pluginId, title]);

  useEffect(() => {
    fetchSrcdoc();
  }, [fetchSrcdoc]);

  // Connect host postMessage bridge scoped to workspace + plugin.
  // openContent opens the native in-app Reader (articles render as app
  // components, video as embeds — no iframe, no cross-plugin messaging).
  //
  // The target window is resolved at MESSAGE time from the iframe element
  // (not captured once at mount: the iframe only renders after the srcdoc
  // fetch resolves, so a mount-time capture is null forever and every reply
  // is dropped). Rebinding on srcdoc change keeps exactly one listener.
  useEffect(() => {
    const bridge = createHostBridge(() => iframeRef.current?.contentWindow ?? null, {
      workspaceId,
      tabId: pluginId,
      pluginId,
      storagePrefix: "polydocks",
      onCollapse: onDismiss,
      onOpenContent: (url) => setReaderUrl(url),
      // The sandbox renders the app theme from the first frame and follows
      // live theme changes without a reload (see guest-bridge theme).
      getTheme: () => useThemeStore.getState().theme,
      onTaskEvent: (event) => {
        const store = useTabHostStore.getState();
        if (event.type === "start") {
          store.registerTask(pluginId, { id: event.taskId, label: event.label || "Task", detail: event.detail });
        } else {
          store.updateTask(event.taskId, event.status || (event.type === "done" ? "done" : "running"), event.detail);
        }
      },
      onReady: () => {
        if (handshakeTimerRef.current) {
          clearTimeout(handshakeTimerRef.current);
          handshakeTimerRef.current = null;
        }
        setIsReady(true);
      },
      onError: (err) => {
        setError(typeof err === "string" ? err : "Runtime error in experience");
      },
    });
    bridgeRef.current = bridge;

    return () => {
      bridge.destroy();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
    };
  }, [workspaceId, pluginId, onDismiss, srcdoc]);

  // Follow the app theme live: push changes into the guest sandbox.
  const activeTheme = useThemeStore((s) => s.theme);
  useEffect(() => {
    bridgeRef.current?.pushTheme(activeTheme);
  }, [activeTheme]);

  // 3-second ready handshake timeout once srcdoc is mounted.
  // Strict for new builds (ready marker present): no ready signal means the
  // guest never mounted, so surface the error row with reload + agent fix
  // instead of revealing potentially raw output.
  useEffect(() => {
    if (!srcdoc || fetching) return;

    handshakeTimerRef.current = setTimeout(() => {
      if (!isReady) {
        if (requiresReadyRef.current) {
          setError(
            `Failed to load ${title || pluginId} (mount timeout: no ready signal from guest)`
          );
        } else {
          // Legacy srcdoc without a ready post: gracefully reveal on load.
          setIsReady(true);
        }
      }
    }, 3000);

    return () => {
      if (handshakeTimerRef.current) {
        clearTimeout(handshakeTimerRef.current);
      }
    };
  }, [srcdoc, fetching, isReady, title, pluginId]);

  const handleIframeLoad = () => {
    // When iframe triggers native load event. New builds wait for the
    // explicit ready signal instead (see timeout above).
    if (!requiresReadyRef.current) {
      setIsReady(true);
    }
  };

  const handleAskAgent = () => {
    const issue = error || `Tool ${title || pluginId} did not respond to ready handshake.`;
    if (onAskAgentFix) {
      onAskAgentFix(issue);
    } else {
      window.dispatchEvent(
        new CustomEvent("polymax:submit-prompt", {
          detail: {
            prompt: `Fix tool "${title || pluginId}": ${issue}`,
            origin: "dock-fix",
          },
        })
      );
    }
  };

  return (
    <div
      className={cn(
        "relative w-full h-full min-h-0 flex-1 flex flex-col bg-transparent select-none",
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
            Mounting {title || pluginId}…
          </span>
        </div>
      )}

      {/* Edge-to-Edge Frameless Sandboxed Surface */}
      {srcdoc && (
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          srcDoc={srcdoc}
          title={title || `plugin-${pluginId}`}
          onLoad={handleIframeLoad}
          className={cn(
            "w-full h-full flex-1 border-0 bg-transparent transition-opacity duration-200",
            !isReady || error ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto"
          )}
        />
      )}
      {/* Background task status: work registered via polymax.task keeps a
          quiet row here so results that finish while hidden are seen. */}
      {isReady && !readerUrl && <TaskNotice tabId={pluginId} />}
        </>
      )}
    </div>
  );
}
