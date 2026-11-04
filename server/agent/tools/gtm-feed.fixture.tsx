import { Button } from "@/components/ui/button";
import { ReaderFeed, ListRow, SearchField, SegmentedControl, InlineMessage, Inline } from "@/components/ui/kit";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type Item = { kind: "article" | "video"; title: string; src: string; url: string; desc: string };

const CURATED: Item[] = [
  { kind: "article", title: "7 Steps to Create a Go-To-Market App Strategy", src: "Median.co", url: "https://median.co/blog/what-is-a-go-to-market-app-strategy-how-to-build-a-fool-proof-promotion-plan-in-7-steps", desc: "Most tactical for apps — 7-step promotion plan." },
  { kind: "article", title: "How to Market a Mobile App Effectively (2026)", src: "Appit Ventures", url: "https://appitventures.com/blog/how-to-market-a-mobile-app", desc: "Most up-to-date 2026 playbook." },
  { kind: "article", title: "GTM Strategy Framework for Tech Startups", src: "HBS Online", url: "https://online.hbs.edu/blog/go-to-market-strategy-framework", desc: "Framework from Harvard Business School." },
  { kind: "article", title: "What Is a GTM Strategy? And How to Create One", src: "Coursera", url: "https://www.coursera.org/articles/go-to-market-strategy", desc: "Beginner-friendly builder guide." },
  { kind: "article", title: "Choose the Right GTM Strategy for Your Mobile App", src: "EB Pearls", url: "https://ebpearls.com.au/learn/go-to-market-strategy-mobile-apps", desc: "App-specific GTM picks." },
  { kind: "article", title: "What is a GTM Strategy? Build One in 11 Steps", src: "Zendesk", url: "https://www.zendesk.es/blog/sales/sales-and-marketing/go-to-market-strategy/", desc: "11-step build guide." },
  { kind: "article", title: "GTM Strategy: Complete Guide", src: "Spider Strategies", url: "https://www.spiderstrategies.com/blog/go-to-market-strategy/", desc: "Complete reference." },
  { kind: "article", title: "Essential GTM Guide for Marketers", src: "Funnel.io", url: "https://funnel.io/blog/go-to-market", desc: "Marketer lens." },
  { kind: "article", title: "Creating a Winning GTM Strategy", src: "Elefante RevOps", url: "https://elefanterevops.com/blog/gtm-strategy", desc: "RevOps take." },
  { kind: "article", title: "Mobile App Marketing Guide", src: "AppsFlyer", url: "https://www.appsflyer.com/blog/measurement-analytics/app-marketing/", desc: "Measurement and analytics." },
  { kind: "article", title: "2026 GTM Strategy Examples", src: "Highspot", url: "https://www.highspot.com/blog/go-to-market-strategy/", desc: "2026 examples." },
  { kind: "article", title: "Winning GTM for Startups", src: "Antler", url: "https://www.antler.co/blog/go-to-market-strategy-for-startups", desc: "Early-stage GTM." },
  { kind: "video", title: "Winning Go-To-Market Plan for Early Stage Startups", src: "YouTube", url: "https://www.youtube.com/watch?v=WMa9zQO8Jug", desc: "Video — plays in the native reader." },
  { kind: "video", title: "Growth for Startups — Gustaf Alstromer (YC)", src: "YouTube · YC", url: "https://www.youtube.com/watch?v=6lY9CYIY4pQ", desc: "Video — plays in the native reader." },
  { kind: "video", title: "How to Get Your First Customers | Startup School (YC)", src: "YouTube · YC", url: "https://www.youtube.com/watch?v=hyYCn_kAngI", desc: "Video — plays in the native reader." },
  { kind: "video", title: "From Zero to Revenue: GTM Playbooks That Actually Work", src: "YouTube · Step SF 2026", url: "https://www.youtube.com/watch?v=rfcC2GWwsHQ", desc: "Video — plays in the native reader." },
  { kind: "video", title: "App Marketing 101: How to Grow in a Crowded App Market", src: "YouTube", url: "https://www.youtube.com/watch?v=4ivLHY6PcD0", desc: "Video — plays in the native reader." },
  { kind: "video", title: "How to Market Your App in 2026 (Step-by-Step)", src: "YouTube", url: "https://www.youtube.com/watch?v=aB-4o2kziGc", desc: "Video — plays in the native reader." },
  { kind: "video", title: "My $1.19M App Process: Launch and Marketing", src: "YouTube", url: "https://www.youtube.com/watch?v=qaA23rN2lMw", desc: "Video — plays in the native reader." },
  { kind: "video", title: "Fastest Way To Blow Up Your App in 2025", src: "YouTube", url: "https://www.youtube.com/watch?v=6m4f1QKg5Vs", desc: "Video — plays in the native reader." },
];

function bridge(): any {
  return (window as any).polymax || (window as any).polydocks;
}

function toItems(raw: any): Item[] {
  const list = raw?.results || raw?.items || raw?.hits || raw?.pages || raw?.data || [];
  if (!Array.isArray(list)) return [];
  const out: Item[] = [];
  for (const h of list.slice(0, 8)) {
    const url = typeof h?.url === "string" ? h.url : null;
    const title = typeof h?.title === "string" ? h.title : null;
    if (!url || !title || !/^https?:\/\//.test(url)) continue;
    out.push({
      kind: /youtu\.?be|vimeo|mp4|webm/i.test(url) ? "video" : "article",
      title,
      src: typeof h?.source === "string" ? h.source : "Fresh via search",
      desc: typeof h?.snippet === "string" ? h.snippet.slice(0, 140) : "Fresh result via capability search.",
    });
  }
  return out;
}

function App() {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Item[]>([]);

  useEffect(() => {
    bridge()
      ?.storage?.get("gtm-feed:read")
      .then((v: unknown) => {
        if (v && typeof v === "object") setRead(v as Record<string, boolean>);
      })
      .catch(() => {});
  }, []);

  const items = useMemo(() => {
    const all = [...fresh, ...CURATED];
    return all.filter((x) => {
      if (filter !== "all" && x.kind !== filter) return false;
      if (unreadOnly && read[x.url]) return false;
      if (q && !(x.title + " " + x.src + " " + x.desc).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [filter, q, unreadOnly, read, fresh]);

  const toggleRead = async (url: string) => {
    const next = { ...read };
    if (next[url]) delete next[url];
    else next[url] = true;
    setRead(next);
    try {
      await bridge()?.storage?.set("gtm-feed:read", next);
    } catch {
      // storage is best-effort; the toggle still applies locally
    }
  };

  const openItem = async (item: Item) => {
    setOpenError(null);
    if (!read[item.url]) await toggleRead(item.url);
    try {
      await bridge()?.openContent(item.url);
    } catch (e: any) {
      setOpenError(e?.message || "Could not open this link in the reader.");
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      const res = await bridge()?.useCapability("search.web", {
        query: "go-to-market strategy mobile app",
        domainType: "news",
        limit: 5,
      });
      const mapped = toItems(res);
      if (mapped.length === 0) {
        setNotice("Search returned no fresh items — showing the curated list.");
      } else {
        setFresh(mapped);
        setNotice(`${mapped.length} fresh items added on top of the curated list.`);
      }
    } catch (e: any) {
      setNotice(e?.message ? `Refresh failed: ${e.message} — showing the curated list.` : "Refresh failed — showing the curated list.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex-none">
        <Inline gap={8}>
          <div className="min-w-40 flex-1">
            <SearchField value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant={unreadOnly ? "default" : "outline"} size="sm" onClick={() => setUnreadOnly(!unreadOnly)}>
            Unread only
          </Button>
          <Button size="sm" variant="secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh via search"}
          </Button>
        </Inline>

        <div className="mt-4">
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "article", label: "Articles" },
              { value: "video", label: "Videos" },
            ]}
          />
        </div>

        {openError ? <InlineMessage tone="error">{openError}</InlineMessage> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ReaderFeed
          notice={notice || undefined}
          loading={refreshing}
          empty={{ title: "Nothing matches these filters", hint: "Try a shorter search or clear the unread filter." }}
        >
          {items.map((x) => (
            <ListRow
              key={x.url}
              title={x.title}
              meta={`${x.src} · ${x.kind === "video" ? "Video" : "Article"}`}
              onOpen={() => openItem(x)}
              action={
                <div className="flex justify-end">
                  <Button size="sm" variant="secondary" onClick={() => toggleRead(x.url)}>
                    {read[x.url] ? "Mark unread" : "Mark read"}
                  </Button>
                </div>
              }
            />
          ))}
        </ReaderFeed>
      </div>

      <p className="flex-none text-xs text-muted-foreground">
        Articles and videos open in the native reader — no popups, no embeds blocked by the source site.
      </p>
    </div>
  );
}

createRoot(document.getElementById("app")).render(<App />);
