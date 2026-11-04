import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/motion";

interface FeedItem {
  id: string;
  kind: string;
  title: string;
  site?: string | null;
  url: string;
  hook?: string | null;
}

/**
 * Demo-scoped research dashboard: renders the LIVE workspace feed
 * (sources.list) as staggered widgets — totals, kind breakdown, top
 * items. Used only by the scripted onboarding tour (demo-dashboard
 * surface); the same data the agent's feed shows, no separate mock.
 */
export function DemoDashboardView() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const isReduced = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/capabilities/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ capabilityId: "sources.list", input: { workspaceId: "default" } }),
        });
        const data = await res.json().catch(() => null);
        const list = data?.data?.data?.items ?? data?.data?.items ?? [];
        if (!cancelled && Array.isArray(list)) setItems(list);
      } catch {
        // Empty dashboard is an honest empty state, never a fake list.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = {
    article: items.filter((i) => i.kind === "article").length,
    paper: items.filter((i) => i.kind === "paper").length,
    video: items.filter((i) => i.kind === "video").length,
  };
  const widgets = [
    { label: "Sources", value: String(items.length) },
    { label: "Articles", value: String(counts.article) },
    { label: "Papers", value: String(counts.paper) },
    { label: "Videos", value: String(counts.video) },
  ];

  return (
    <div
      data-tour="dashboard"
      aria-label="Research dashboard (demo)"
      className="flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto p-5"
    >
      <div className="flex-none">
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">Demo dashboard</p>
        <h2 className="text-sm font-semibold text-[var(--text-main)]">Research overview</h2>
      </div>
      <div className="grid flex-none grid-cols-2 gap-2 sm:grid-cols-4">
        {widgets.map((w, i) => (
          <div
            key={w.label}
            data-tour-widget={w.label}
            className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5"
            style={
              !isReduced && loaded
                ? { animation: "onboard-chip-in .3s ease-out both", animationDelay: `${i * 180}ms` }
                : undefined
            }
          >
            <p className="text-lg font-semibold text-[var(--text-main)]">{loaded ? w.value : "…"}</p>
            <p className="text-[11px] text-muted-foreground">{w.label}</p>
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {items.slice(0, 6).map((item, i) => (
          <div
            key={item.id}
            className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2"
            style={
              !isReduced && loaded
                ? { animation: "onboard-chip-in .3s ease-out both", animationDelay: `${400 + i * 180}ms` }
                : undefined
            }
          >
            <p className="truncate text-xs font-medium text-white/85">{item.title}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {item.site ?? ""} · {item.kind}
            </p>
          </div>
        ))}
        {loaded && items.length === 0 && (
          <p className="text-xs text-muted-foreground">No sources yet — the research step fills this feed.</p>
        )}
      </div>
      <style>{DASHBOARD_CSS}</style>
    </div>
  );
}

const DASHBOARD_CSS = `
@keyframes onboard-chip-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; }
}
`;
