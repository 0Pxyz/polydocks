import { useCallback, useEffect, useState } from "react";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";

export interface SourceCard {
  id: string;
  url: string;
  title: string;
  site?: string | null;
  kind?: string | null;
  image?: string | null;
}

interface SourcesViewProps {
  onOpenUrl: (url: string) => void;
  className?: string;
}

/** Site logo via favicon service; never throws, never blanks (see tile fallback). */
export function faviconUrlFor(site: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site)}&sz=64`;
}

function siteOf(source: SourceCard): string {
  if (source.site) return source.site;
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.url;
  }
}

function kindLabel(kind: string | null | undefined): string | null {
  if (kind === "video") return "Video";
  if (kind === "paper") return "Paper";
  if (kind === "course") return "Course";
  return null;
}

/**
 * Sources feed (#352): the Browser surface's empty state (its manifest
 * entry is SourcesView). Cards carry title, canonical URL and site logo;
 * new saves stream in live via the polydocks:source.added window event the
 * agent turn path already dispatches — no manual refresh, no polling.
 * Click opens the URL in the Browser surface (same surface, #350).
 */
export function SourcesView({ onOpenUrl, className = "" }: SourcesViewProps) {
  const [sources, setSources] = useState<SourceCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [brokenIcons, setBrokenIcons] = useState<Record<string, true>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const wsId = useWorkspaceStore.getState().activeWorkspaceId || "default";
    fetch("/api/plugins/sources/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: wsId }),
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as any;
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setLoadError(json?.error || `Could not load sources (HTTP ${res.status})`);
          return;
        }
        const items = (json?.data?.items || json?.data) as SourceCard[];
        setSources(Array.isArray(items) ? items : []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load sources");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Live capture: every sources.add during a research turn prepends its
    // card the moment the server emits it (dedupe by id, newest first).
    const onAdded = (ev: Event) => {
      const source = (ev as CustomEvent).detail as SourceCard | null;
      if (!source || typeof source.id !== "string" || typeof source.url !== "string") return;
      setSources((prev) => {
        if (prev.some((s) => s.id === source.id)) return prev;
        return [source, ...prev];
      });
    };
    window.addEventListener("polydocks:source.added", onAdded);
    return () => {
      cancelled = true;
      window.removeEventListener("polydocks:source.added", onAdded);
    };
  }, []);

  const markBroken = useCallback((id: string) => {
    setBrokenIcons((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }, []);

  return (
    <div data-sources-view className={`w-full h-full flex-1 min-w-0 min-h-0 overflow-y-auto px-6 py-6 font-sans ${className}`}>
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Sources</h2>
        <p className="text-xs text-muted-foreground -mt-1 mb-2">
          Saved research for this workspace. Ask Poly to research a topic and new sources appear here live.
        </p>
        {loading && (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground" aria-live="polite">
            <span className="w-5 h-5 rounded-full border-2 border-muted border-t-primary animate-spin" />
            Loading sources…
          </div>
        )}
        {!loading && loadError && <p className="py-4 text-xs text-destructive">{loadError}</p>}
        {!loading && !loadError && sources.length === 0 && (
          <p className="py-6 text-xs text-muted-foreground">
            No saved sources yet — ask Poly to research a topic, or type a URL above to read it here.
          </p>
        )}
        {!loading &&
          !loadError &&
          sources.map((source) => {
            const site = siteOf(source);
            const kind = kindLabel(source.kind);
            const showTile = brokenIcons[source.id];
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => onOpenUrl(source.url)}
                title={source.url}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 cursor-pointer text-left"
              >
                {showTile ? (
                  <span
                    aria-hidden
                    className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-sm font-semibold text-foreground shrink-0"
                  >
                    {(site.charAt(0) || "?").toUpperCase()}
                  </span>
                ) : (
                  <img
                    src={source.image || faviconUrlFor(site)}
                    alt=""
                    loading="lazy"
                    onError={() => markBroken(source.id)}
                    className="w-8 h-8 rounded-lg shrink-0 object-cover bg-muted"
                  />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium text-foreground truncate">
                    {source.title || source.url}
                  </span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {site}
                    {kind ? ` · ${kind}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
