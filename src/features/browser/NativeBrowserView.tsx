import { useCallback, useEffect, useRef, useState } from "react";
import { RemoteBrowser, type RemoteBrowserHandle } from "@atriumjs/react";
import { useTabState } from "@/lib/tabs/useTabState";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { ReaderView } from "@/features/dock/ReaderView";
import {
  browserHealth,
  createBrowserSession,
  destroyBrowserSession,
  getBrowserSession,
  grantBrowserControl,
  navigateBrowserSession,
  resolveViewerWsUrl,
  type BrowserSession,
} from "./browserClient";

interface NativeBrowserViewProps {
  workspaceKey: string;
  initialUrl?: string;
  className?: string;
}

interface BrowserTab {
  id: string;
  url: string;
  session: BrowserSession | null;
}

/** One Chromium per tab (worker cap); the sidebar is the only tab UI. */
const MAX_TABS = 5;

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "about:blank") return "about:blank";
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).toString();
    return new URL(`https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

function shortLabel(url: string, fallback: string): string {
  if (!url) return fallback;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") || fallback;
  } catch {
    return url.length > 18 ? `${url.slice(0, 18)}…` : url;
  }
}

/**
 * Native PolyDocks browser surface: real Chromium via Atrium worker,
 * rendered with the first-party <RemoteBrowser /> canvas viewer.
 * Lateral tab rail (one worker session per tab, capped at MAX_TABS);
 * new tabs start blank. PolyDocks-token toolbar, never a Chrome replica.
 * No viewer chatter: connection state is a single dot, and the vendored
 * viewer's presence pill is hidden (see NATIVE_BROWSER_CSS; degrade = pill
 * reappears, nothing breaks).
 */
export function NativeBrowserView({ workspaceKey, initialUrl, className = "" }: NativeBrowserViewProps) {
  const tabId = `browser:${workspaceKey}`;
  const [tabs, setTabs] = useTabState<BrowserTab[]>(tabId, "tabs", []);
  const [activeTabId, setActiveTabId] = useTabState<string | null>(tabId, "activeTab", null);
  const [counter, setCounter] = useTabState<number>(tabId, "counter", 0);
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "ended">("idle");
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const viewerRef = useRef<RemoteBrowserHandle>(null);
  const ensuredRef = useRef(false);
  const reensuredRef = useRef(false);
  // URL typed while no live viewer exists (or while recovering a dead worker
  // session). The worker only materializes Chromium on viewer connection and
  // server-side navigate 502s until then, so queue and flush on live instead
  // of minting a fresh session per keystroke (about:blank tab sprawl).
  const pendingNavigateRef = useRef<string | null>(null);
  const readerUrl = useConversationStore((s) => s.readerView?.url);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeUrl = activeTab?.url ?? "";

  const isUsableSession = (s: BrowserSession | null): s is BrowserSession =>
    Boolean(s && s.sessionId && s.viewerToken && s.wsUrl);

  /** Desktop viewport matched to the stage aspect so the canvas fills
   *  edge-to-edge (no letterbox bars); phone-shaped on narrow screens. */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pickViewport = () => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      return { w: 390, h: 844 };
    }
    const rect = stageRef.current?.getBoundingClientRect();
    const aspect =
      rect && rect.width > 10 && rect.height > 10 ? rect.width / rect.height : 16 / 10;
    const h = 800;
    const w = Math.min(1920, Math.max(800, Math.round(h * aspect)));
    return { w, h };
  };

  // Keep the vendored stage box exactly at the container aspect: it fills
  // edge-to-edge while keeping intrinsic height (a plain height:100% chain
  // collapses when an ancestor has indefinite height, blanking the page).
  useEffect(() => {
    const stage = stageRef.current;
    const root = rootRef.current;
    if (!stage || !root || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        const w = Math.min(1920, Math.max(800, Math.round((rect.width / rect.height) * 800)));
        root.style.setProperty("--browser-ar", `${w} / 800`);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  const setTabSession = useCallback(
    (id: string, next: BrowserSession | null) => {
      setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, session: next } : t)));
    },
    [setTabs]
  );

  /** Destroy the old server session (best-effort) so it stops counting
   * against the per-workspace cap, then create a fresh one. */
  const replaceSession = useCallback(
    async (tab: BrowserTab, seedUrl?: string): Promise<BrowserSession> => {
      if (tab.session) await destroyBrowserSession(workspaceKey, tab.session.sessionId);
      setTabSession(tab.id, null);
      const created = await createBrowserSession(workspaceKey, seedUrl, pickViewport());
      setTabSession(tab.id, created);
      await grantBrowserControl(workspaceKey, created.sessionId).catch(() => undefined);
      return created;
    },
    [workspaceKey, setTabSession]
  );

  const setTabUrl = useCallback(
    (id: string, url: string) => {
      setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, url } : t)));
    },
    [setTabs]
  );

  const ensureTabSession = useCallback(
    async (tab: BrowserTab, seedUrl?: string): Promise<BrowserSession> => {
      const cached = isUsableSession(tab.session) ? tab.session : null;
      if (cached) {
        const alive = await getBrowserSession(workspaceKey, cached.sessionId);
        if (alive) return cached;
        // Stale record: destroy server-side so it stops counting against
        // the per-workspace cap before creating the replacement.
        await destroyBrowserSession(workspaceKey, cached.sessionId);
        setTabSession(tab.id, null);
      }
      const created = await createBrowserSession(workspaceKey, seedUrl, pickViewport());
      setTabSession(tab.id, created);
      await grantBrowserControl(workspaceKey, created.sessionId).catch(() => undefined);
      return created;
    },
    [workspaceKey, setTabSession]
  );

  const boot = useCallback(async () => {
    setError(null);
    try {
      const health = await browserHealth();
      if (!health.configured) {
        setUnavailable(true);
        return;
      }
      setUnavailable(false);
      let list = tabs;
      let active = list.find((t) => t.id === activeTabId) ?? null;
      if (list.length === 0) {
        const id = `tab-1`;
        setCounter(1);
        const fresh: BrowserTab = { id, url: initialUrl || "", session: null };
        list = [fresh];
        active = fresh;
        setTabs(list);
        setActiveTabId(id);
      }
      if (!active) {
        active = list[0];
        setActiveTabId(active.id);
      }
      const live = await ensureTabSession(active, active.url || "about:blank");
      setSession(live);
      setUrlInput(active.url);
      reensuredRef.current = false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not start the browser session";
      if (
        msg.includes("503") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("worker_bootstrap_failed") ||
        msg.includes("browser_create_") ||
        msg.includes("worker_unreachable")
      ) {
        setFallbackMode(true);
        setStatus("live");
        setError(null);
      } else {
        setError(msg);
      }
    }
  }, [workspaceKey, initialUrl, tabs, activeTabId, setTabs, setActiveTabId, setCounter, ensureTabSession, urlInput]);

  useEffect(() => {
    if (ensuredRef.current) return;
    ensuredRef.current = true;
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the viewer + input in sync when the active tab changes.
  useEffect(() => {
    if (!activeTab) {
      setSession(null);
      return;
    }
    setUrlInput(activeTab.url);
    setStatus("connecting");
    if (isUsableSession(activeTab.session)) {
      setSession(activeTab.session);
      return;
    }
    let cancelled = false;
    void ensureTabSession(activeTab, activeTab.url || "about:blank")
      .then((live) => {
        if (!cancelled) {
          setSession(live);
          reensuredRef.current = false;
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Could not start the tab";
        if (
          msg.includes("503") ||
          msg.includes("ECONNREFUSED") ||
          msg.includes("worker_bootstrap_failed") ||
          msg.includes("browser_create_") ||
          msg.includes("worker_unreachable")
        ) {
          setFallbackMode(true);
          setStatus("live");
          setError(null);
        } else if (!cancelled) {
          setError(msg);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // Agent integration: browser.open / open_source emits reader.open with a URL.
  // Show it in the active tab's remote session — one surface for all web
  // content, including video (remote playback for now; audio is the open goal).
  const lastAgentUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!readerUrl || !activeTab || !session) return;
    if (lastAgentUrlRef.current === readerUrl) return;
    lastAgentUrlRef.current = readerUrl;
    const normalized = normalizeUrl(readerUrl);
    if (!normalized) return;
    setUrlInput(normalized);
    setTabUrl(activeTab.id, normalized);
    void navigateBrowserSession(workspaceKey, session.sessionId, normalized).catch(() => undefined);
    viewerRef.current?.navigate(normalized);
  }, [readerUrl, activeTab, session, workspaceKey, setTabUrl]);

  const handleNavigate = useCallback(async () => {
    if (!activeTab) return;
    const normalized = normalizeUrl(urlInput);
    if (!normalized) return;
    if (fallbackMode || !session) {
      setTabUrl(activeTab.id, normalized);
      setUrlInput(normalized);
      return;
    }
    setError(null);
    setTabUrl(activeTab.id, normalized);
    setUrlInput(normalized);
    // Fire through the live viewer channel when possible; the worker session
    // may not exist yet (or died with a worker restart), in which case the
    // HTTP navigate 502s. Queue for the live flush instead of retrying
    // against a session with no Chromium behind it.
    const attempt = async (sessionId: string) => {
      viewerRef.current?.navigate(normalized);
      await navigateBrowserSession(workspaceKey, sessionId, normalized);
    };
    if (status === "live") {
      try {
        await attempt(session.sessionId);
        pendingNavigateRef.current = null;
        return;
      } catch {
        // Fall through to recovery below.
      }
    } else {
      viewerRef.current?.navigate(normalized);
      pendingNavigateRef.current = normalized;
      setError("Connecting… it will load as soon as the session is live.");
      return;
    }
    // Worker-side sessions die with the worker (restart wipes them) while
    // our record survives. Re-ensure once, then let the fresh viewer's live
    // flush do the navigation — an immediate HTTP navigate would 502 again
    // because Chromium materializes on viewer connection, not on create.
    if (!reensuredRef.current) {
      reensuredRef.current = true;
      try {
        const created = await replaceSession(activeTab, normalized);
        setSession(created);
        pendingNavigateRef.current = normalized;
      } catch (retryErr: unknown) {
        setError(retryErr instanceof Error ? retryErr.message : "Navigation failed");
      }
      return;
    }
    setError("Navigation failed. Retry to start a new session.");
  }, [urlInput, activeTab, session, status, workspaceKey, setTabUrl, replaceSession]);

  const handleNewTab = useCallback(async () => {
    if (tabs.length >= MAX_TABS) return;
    const n = counter + 1;
    setCounter(n);
    const fresh: BrowserTab = { id: `tab-${n}`, url: "", session: null };
    setTabs((prev) => [...prev, fresh]);
    setActiveTabId(fresh.id);
    setError(null);
  }, [tabs.length, counter, setCounter, setTabs, setActiveTabId]);

  const handleCloseTab = useCallback(
    async (id: string) => {
      const closing = tabs.find((t) => t.id === id);
      if (closing?.session) await destroyBrowserSession(workspaceKey, closing.session.sessionId);
      const rest = tabs.filter((t) => t.id !== id);
      if (rest.length === 0) {
        const n = counter + 1;
        setCounter(n);
        const fresh: BrowserTab = { id: `tab-${n}`, url: "", session: null };
        setTabs([fresh]);
        setActiveTabId(fresh.id);
        return;
      }
      setTabs(rest);
      if (activeTabId === id) setActiveTabId(rest[rest.length - 1].id);
    },
    [tabs, activeTabId, counter, setCounter, setTabs, setActiveTabId, workspaceKey]
  );

  const handleCloseSession = useCallback(async () => {
    if (!activeTab) return;
    if (activeTab.session) await destroyBrowserSession(workspaceKey, activeTab.session.sessionId);
    const cleared: BrowserTab = { ...activeTab, url: "", session: null };
    setTabs((prev) => prev.map((t) => (t.id === cleared.id ? cleared : t)));
    setSession(null);
    setUrlInput("");
    reensuredRef.current = false;
    try {
      const created = await createBrowserSession(workspaceKey, "about:blank", pickViewport());
      setSession(created);
      setTabSession(cleared.id, created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not start a new session");
    }
  }, [activeTab, workspaceKey, setTabs, setTabSession]);

  if (unavailable) {
    // Graceful fallback: worker not configured — keep the Reader experience.
    return (
      <div className={`w-full h-full flex flex-col min-h-[480px] ${className}`}>
        <div className="px-3 py-2 text-xs text-muted-foreground border border-border rounded-xl bg-muted/30 mb-2">
          Remote browser is not configured (missing ATRIUM_WORKER_SECRET). Showing the lightweight
          reader instead. Start the worker:{" "}
          <code className="text-primary">ATRIUM_WORKER_SECRET=dev-secret-change-me npx atrium-worker</code>
        </div>
        <ReaderView url={activeUrl || "https://example.com/"} />
      </div>
    );
  }

  return (
    <div ref={rootRef} data-native-browser className={`w-full flex-1 min-w-0 flex flex-col min-h-[60dvh] ${className}`}>
      <style>{NATIVE_BROWSER_CSS}</style>
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => viewerRef.current?.back()}
            aria-label="Back"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => viewerRef.current?.forward()}
            aria-label="Forward"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => viewerRef.current?.reload()}
            aria-label="Reload"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          >
            ⟳
          </button>
        </div>
        <form
          className="flex-1 flex items-center gap-2 min-w-[180px]"
          onSubmit={(e) => {
            e.preventDefault();
            void handleNavigate();
          }}
        >
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Enter a URL…"
            spellCheck={false}
            inputMode="url"
            className="flex-1 h-9 px-3 rounded-xl bg-muted/50 border border-border text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-sans"
          />
          <button
            type="submit"
            className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:brightness-110 cursor-pointer shrink-0"
          >
            Go
          </button>
        </form>
        <span
          role="status"
          aria-label={status === "live" ? "Browser live" : "Browser connecting"}
          title={status === "live" ? "Browser live" : "Browser connecting"}
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${status === "live" ? "bg-primary" : "bg-muted-foreground animate-pulse"}`}
        />
        <button
          type="button"
          onClick={() => void handleCloseSession()}
          aria-label="Close session and start a new one"
          title="Close session and start a new one"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer shrink-0"
        >
          ×
        </button>
      </div>

      {error && (
        <div className="mx-1 mb-2 px-3 py-2 text-xs text-destructive border border-destructive/30 rounded-xl bg-destructive/10 flex items-center justify-between gap-2">
          <span className="truncate">{error}</span>
          <button type="button" onClick={() => void boot()} className="text-primary hover:underline cursor-pointer shrink-0">
            Retry
          </button>
        </div>
      )}

      <div className="flex-1 min-w-0 min-h-0 flex gap-0">
        {/* Lateral tab rail: one worker session per tab. */}
        <div
          role="tablist"
          aria-label="Browser tabs"
          className="w-14 md:w-40 shrink-0 flex flex-col gap-1 overflow-y-auto"
        >
          {tabs.map((t, i) => {
            const isActive = t.id === activeTabId;
            return (
              <div
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTabId(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveTabId(t.id);
                  }
                }}
                tabIndex={0}
                title={t.url || "New tab"}
                className={`group flex items-center gap-1.5 px-2 h-9 rounded-xl cursor-pointer border text-left ${
                  isActive
                    ? "bg-muted border-border text-foreground"
                    : "bg-transparent border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <span className="w-4 text-center text-[10px] font-mono shrink-0 text-muted-foreground">
                  {i + 1}
                </span>
                <span className="hidden md:block flex-1 truncate text-xs font-sans">
                  {t.url ? shortLabel(t.url, "New tab") : "New tab"}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCloseTab(t.id);
                  }}
                  aria-label={`Close ${shortLabel(t.url, "tab")}`}
                  className="hidden group-hover:flex w-5 h-5 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer shrink-0"
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => void handleNewTab()}
            disabled={tabs.length >= MAX_TABS}
            aria-label={tabs.length >= MAX_TABS ? `Tab limit reached (${MAX_TABS})` : "New tab"}
            title={tabs.length >= MAX_TABS ? `Tab limit reached (${MAX_TABS})` : "New tab"}
            className="flex items-center justify-center md:justify-start gap-1.5 px-2 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer disabled:opacity-40 disabled:cursor-default text-xs font-sans"
          >
            <span className="text-base leading-none">+</span>
            <span className="hidden md:inline">New tab</span>
          </button>
        </div>

        <div
          ref={stageRef}
          className="flex-1 min-w-0 min-h-0 overflow-hidden bg-background flex flex-col"
        >
          {session ? (
            <RemoteBrowser
              key={session.sessionId}
              ref={viewerRef}
              sessionId={session.sessionId}
              viewerToken={session.viewerToken}
              wsUrl={resolveViewerWsUrl(session.wsUrl)}
              interactive
              chrome="none"
              showSessionStatus={false}
              style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}
              onControlChange={() => {
                setStatus("live");
                // Flush a URL queued while the viewer was not live (or while
                // recovering a dead worker session). Viewer channel first —
                // it targets the session Chromium that just materialized —
                // then best-effort HTTP so the server record stays in sync.
                const pending = pendingNavigateRef.current;
                if (pending && session) {
                  pendingNavigateRef.current = null;
                  reensuredRef.current = false;
                  setError(null);
                  viewerRef.current?.navigate(pending);
                  void navigateBrowserSession(workspaceKey, session.sessionId, pending).catch(
                    () => undefined
                  );
                }
              }}
              onTerminated={(reason) => {
                // A terminated stream usually means expiry or idle eviction.
                // Re-ensure once automatically so the surface recovers instead
                // of stranding the user.
                if (!reensuredRef.current) {
                  reensuredRef.current = true;
                  void (async () => {
                    if (!activeTab) return;
                    setTabSession(activeTab.id, null);
                    try {
                      const created = await ensureTabSession(
                        { ...activeTab, session: null },
                        activeTab.url || undefined
                      );
                      setSession(created);
                    } catch {
                      setError(`Session ended (${reason}). Retry to start a new one.`);
                    }
                  })();
                } else {
                  setStatus("ended");
                  setError(`Session ended (${reason}). Retry to start a new one.`);
                }
              }}
              onError={(err) => {
                if (err instanceof Error && /reconnect_exhausted/i.test(err.message)) {
                  setStatus("ended");
                  setError("Lost connection to the remote browser. Retry to reconnect.");
                }
              }}
            />
          ) : fallbackMode ? (
            <div className="flex-1 min-h-0 w-full overflow-y-auto px-6 py-6 font-sans">
              <div className="max-w-3xl mx-auto">
                {activeUrl ? (
                  <ReaderView url={activeUrl} />
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <span className="text-xs">Type a URL above to read it here.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            !error && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground" aria-live="polite">
                <div className="w-8 h-8 rounded-full border-2 border-muted border-t-primary animate-spin" />
                <span className="text-xs">Starting a real Chromium session…</span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Vendor overrides (fragile by nature, graceful degradation):
 * - Hide the presence pill ("You have control" / "Automation in control").
 *   It is the only `aria-hidden` element with a direct <span> child.
 * - Strip the canvas frame (border + radius + backdrop) so the viewport is
 *   truly edge-to-edge instead of a floating box. The canvas is the only
 *   <canvas> directly inside the stage.
 * If upstream markup changes, the worst case is the vendor chrome reappears
 * — nothing breaks.
 */
const NATIVE_BROWSER_CSS = `
[data-native-browser] #atrium-remote-panel > div[aria-hidden="true"]:has(> span) {
  display: none !important;
}
[data-native-browser] #atrium-remote-panel > canvas {
  border: none !important;
  border-radius: 0 !important;
  outline: none !important;
  background: transparent !important;
}
/* Edge-to-edge stage: drop the vendor's fixed aspect-ratio box so the page
 * fills the flex area (width/height 100%). The canvas keeps
 * object-fit: contain, so the page never stretches — with the session
 * viewport bootstrapped to the measured stage aspect there is nothing left
 * to letterbox. If upstream markup changes, the aspect box simply returns. */
[data-native-browser] #atrium-remote-panel {
  aspect-ratio: var(--browser-ar, 16 / 10) !important;
  width: 100% !important;
  height: auto !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
}
`;
