import { useState, useEffect, useCallback } from "react";
import type {
  CityWorkspaceData,
  CityNoteItem,
  CitySourceItem,
  CityQuestItem,
  CityDynamicTab,
} from "./types";

function formatCityTitle(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDefaultQuests(cityTitle: string): CityQuestItem[] {
  return [
    {
      id: "fundamentals",
      title: `Master ${cityTitle} Core Principles`,
      description: `Read the foundational primary sources and synthesize an architectural overview in notes.`,
      xpReward: 100,
      completed: false,
    },
    {
      id: "deep-dive",
      title: `Analyze SOTA Research Paper`,
      description: `Examine a primary breakthrough paper from the TinyFish discovery feed.`,
      xpReward: 150,
      completed: false,
    },
    {
      id: "synthesis",
      title: `Synthesize Dynamic Practice Tool`,
      description: `Ask the dock agent to create a flashcards or comparator tool for this city.`,
      xpReward: 250,
      completed: false,
    },
  ];
}

export function useCityWorkspace(cityId: string) {
  const [data, setData] = useState<CityWorkspaceData>(() => {
    const formattedTitle = formatCityTitle(cityId);
    return {
      cityId,
      title: formattedTitle,
      region: "Core Knowledge",
      level: 2,
      tags: ["concept", "autonomous-workspace"],
      notes: [
        {
          name: "summary.md",
          path: "notes/summary.md",
          content: `# ${formattedTitle}\n\nWelcome to the ${formattedTitle} autonomous city workspace.\n\nAll notes, TinyFish web discoveries, dynamic tools, and quests for this domain are mounted here.`,
          updatedAt: new Date().toISOString(),
        },
      ],
      sources: [
        {
          title: `${formattedTitle} - Foundational Guide & Architecture`,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(formattedTitle.replace(/\s+/g, "_"))}`,
          kind: "article",
          why: "Comprehensive introductory taxonomy and primary definitions.",
          domain: "wikipedia.org",
        },
      ],
      quests: getDefaultQuests(formattedTitle),
      dynamicTabs: [],
    };
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCityData = useCallback(async () => {
    if (!cityId) return;
    try {
      setLoading(true);
      setError(null);

      // Fetch city context
      const res = await fetch(`/api/cities/${encodeURIComponent(cityId)}`);
      if (res.ok) {
        const json = await res.json();
        const cityData = json.data;

        const notesList: CityNoteItem[] = Array.isArray(cityData?.notes)
          ? cityData.notes.map((n: string) => ({
              name: n,
              path: `notes/${n}`,
              content: `# ${n}\n\nWorkspace note for ${formatCityTitle(cityId)}.`,
            }))
          : [];

        if (notesList.length === 0) {
          notesList.push({
            name: "summary.md",
            path: "notes/summary.md",
            content: `# ${formatCityTitle(cityId)}\n\nWelcome to the active workspace for ${formatCityTitle(cityId)}.`,
          });
        }

        // Enriched sources table is the single source of truth:
        // populated via sources.add and migration. Never reads raw filenames or "#" links.
        let sourcesList: CitySourceItem[] = [];
        try {
          const sourcesRes = await fetch(`/api/cities/${encodeURIComponent(cityId)}/sources`);
          if (sourcesRes.ok) {
            const json = await sourcesRes.json();
            if (Array.isArray(json.data)) {
              sourcesList = json.data
                .filter((item: any) => item && typeof item.url === "string" && item.url !== "#" && typeof item.title === "string")
                .map((item: any) => ({
                  id: item.id,
                  title: item.title,
                  url: item.url,
                  kind: item.kind || "article",
                  site: item.site,
                  domain: item.site || (item.url ? new URL(item.url).hostname.replace(/^www\./, "") : "web"),
                  image: item.image || null,
                  author: item.author || null,
                  hook: item.hook || null,
                  why: item.hook || undefined,
                  publishedAt: item.publishedAt || null,
                  readMinutes: item.readMinutes || null,
                  durationSec: item.durationSec || null,
                }));
            }
          }
        } catch {
          // Non-fatal
        }

        // Fetch dynamic tabs
        let dynamicTabs: CityDynamicTab[] = [];
        try {
          const tabsRes = await fetch(`/api/cities/${encodeURIComponent(cityId)}/tabs`);
          if (tabsRes.ok) {
            const tabsJson = await tabsRes.json();
            dynamicTabs = tabsJson.data || [];
          }
        } catch {
          // Dynamic tabs optional
        }

        setData((prev) => ({
          ...prev,
          cityId,
          title: formatCityTitle(cityId),
          notes: notesList,
          sources: sourcesList,
          dynamicTabs,
          quests: prev.quests.length > 0 ? prev.quests : getDefaultQuests(formatCityTitle(cityId)),
        }));
      }
    } catch (err: any) {
      // In offline / unit test environment, fallback to structured defaults
      setError(err?.message || "Failed to load city workspace context");
    } finally {
      setLoading(false);
    }
  }, [cityId]);

  useEffect(() => {
    fetchCityData();
  }, [fetchCityData]);

  // Live SSE listener: when the agent or user adds a source, update the feed automatically
  useEffect(() => {
    const handleSourceAdded = (e: Event) => {
      const added = (e as CustomEvent).detail;
      if (!added || !added.url || !added.title || added.url === "#") return;
      if (added.cityId && added.cityId !== cityId) return;

      setData((prev) => {
        if (prev.sources.some((s) => s.id === added.id || (s.url && s.url === added.url))) {
          return prev;
        }
        const newSource: CitySourceItem = {
          id: added.id,
          title: added.title,
          url: added.url,
          kind: added.kind || "article",
          site: added.site || (added.url ? new URL(added.url).hostname.replace(/^www\./, "") : "web"),
          domain: added.site || (added.url ? new URL(added.url).hostname.replace(/^www\./, "") : "web"),
          image: added.image || null,
          author: added.author || null,
          hook: added.hook || null,
          why: added.hook || undefined,
          publishedAt: added.publishedAt || null,
          readMinutes: added.readMinutes || null,
          durationSec: added.durationSec || null,
        };
        return {
          ...prev,
          sources: [newSource, ...prev.sources],
        };
      });
    };

    window.addEventListener("polymax:source.added", handleSourceAdded);
    return () => {
      window.removeEventListener("polymax:source.added", handleSourceAdded);
    };
  }, [cityId]);

  const saveNote = useCallback((name: string, content: string) => {
    setData((prev) => {
      const exists = prev.notes.some((n) => n.name === name);
      const updatedNotes = exists
        ? prev.notes.map((n) => (n.name === name ? { ...n, content, updatedAt: new Date().toISOString() } : n))
        : [...prev.notes, { name, path: `notes/${name}`, content, updatedAt: new Date().toISOString() }];
      return { ...prev, notes: updatedNotes };
    });
  }, []);

  const toggleQuest = useCallback((questId: string) => {
    let completedQuest: CityQuestItem | undefined;
    setData((prev) => {
      const updatedQuests = prev.quests.map((q) => {
        if (q.id === questId) {
          const nextCompleted = !q.completed;
          completedQuest = { ...q, completed: nextCompleted };
          return completedQuest;
        }
        return q;
      });
      return { ...prev, quests: updatedQuests };
    });
    return completedQuest;
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchCityData,
    saveNote,
    toggleQuest,
  };
}
