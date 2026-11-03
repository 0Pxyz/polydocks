import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Brain } from "lucide-react";

/**
 * Agent memory inspector (#105): reads the durable memory engine through
 * GET /api/agent/memory and manages it through the existing record / entry
 * / full-file routes. No new API: entries have no stable ids (plain
 * markdown lines), so "edit" is delete + re-record for episodic logs and
 * inline line edit + full-file PUT for the curated file.
 */

export const MEMORY_CATEGORIES = [
  "user_preference",
  "architectural_rule",
  "project_insight",
  "tool_usage",
  "general",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

/** Server section headers (server/agent/memory.ts getSectionHeaderForCategory). */
const HEADER_BY_CATEGORY: Record<MemoryCategory, string> = {
  user_preference: "## User Insights & Preferences",
  architectural_rule: "## Architectural Guidelines",
  project_insight: "## Active Projects & Workspace Insights",
  tool_usage: "## Installed Tools & Capabilities",
  general: "## General Insights",
};

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  user_preference: "Preferences",
  architectural_rule: "Guidelines",
  project_insight: "Projects",
  tool_usage: "Tools",
  general: "General",
};

export interface DailyLog {
  date: string;
  filename: string;
  content: string;
  entryCount: number;
}

export interface CuratedGroup {
  category: MemoryCategory;
  header: string;
  /** Indices into the full file line array. */
  lineIndices: number[];
}

const HEADER_TO_CATEGORY = new Map<string, MemoryCategory>(
  (Object.entries(HEADER_BY_CATEGORY) as Array<[MemoryCategory, string]>).map(([c, h]) => [h, c])
);

function isBullet(line: string): boolean {
  const t = line.trim();
  return t.startsWith("-") && !t.startsWith("---");
}

/**
 * Splits MEMORY.md into category groups. Pure and exported for tests.
 * Unknown ## sections become their own group under "general" with the
 * original header preserved, so PUT round-trips never drop content.
 */
export function parseCuratedMemory(md: string): { groups: CuratedGroup[]; lines: string[] } {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const groups: CuratedGroup[] = [];
  let current: CuratedGroup | null = null;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      current = {
        category: HEADER_TO_CATEGORY.get(trimmed) ?? "general",
        header: trimmed,
        lineIndices: [],
      };
      groups.push(current);
      return;
    }
    if (current && isBullet(line)) current.lineIndices.push(i);
  });
  return { groups: groups.filter((g) => g.lineIndices.length > 0), lines };
}

/** Episodic `- [time] [category]...: text` lines from a daily log. Pure, exported for tests. */
export function parseDailyEntries(content: string): string[] {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ["));
}

function stripEntryPrefix(entry: string): string {
  return entry.replace(/^-\s*\[[^\]]*\]\s*(\[[^\]]*\]\s*)?(\(workspace:[^)]*\)\s*)?:\s*/, "").trim() || entry;
}

export function MemoryInspectorView() {
  const [memoryMd, setMemoryMd] = useState<string | null>(null);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MemoryCategory | "all">("all");
  const [openDates, setOpenDates] = useState<Set<string>>(new Set());
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("user_preference");
  const [newDurable, setNewDurable] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/memory", { credentials: "include" });
      if (!res.ok) throw new Error(`Memory service returned ${res.status}.`);
      const data = await res.json();
      const md = typeof data.memoryMd === "string" ? data.memoryMd : "# Long-Term Curated Memory\n";
      setMemoryMd(md);
      setLines(md.replace(/\r\n/g, "\n").split("\n"));
      setDailyLogs(Array.isArray(data.dailyLogs) ? data.dailyLogs : []);
    } catch (err: any) {
      setError(err?.message || "Could not load memory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = async (key: string, fn: () => Promise<Response>, okText: string): Promise<boolean> => {
    setBusy(key);
    setNotice(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status}).`);
      }
      setNotice({ ok: true, text: okText });
      await refresh();
      return true;
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || "Request failed." });
      return false;
    } finally {
      setBusy(null);
      setEditingLine(null);
    }
  };

  const saveCurated = (nextLines: string[]) =>
    mutate("save-curated", () =>
      fetch("/api/agent/memory", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: nextLines.join("\n") }),
      }), "Memory updated.");

  const deleteEntry = (content: string, scope: "curated" | "daily", date?: string) =>
    mutate(`del-${scope}-${content.slice(0, 24)}`, () =>
      fetch("/api/agent/memory/entry", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content, scope, date }),
      }), "Entry removed.");

  const { groups } = useMemo(() => parseCuratedMemory(lines.join("\n")), [lines]);
  const q = search.trim().toLowerCase();
  const visibleGroups = useMemo(
    () =>
      groups
        .filter((g) => filter === "all" || g.category === filter)
        .map((g) => ({
          ...g,
          lineIndices: g.lineIndices.filter((i) => !q || lines[i].toLowerCase().includes(q)),
        }))
        .filter((g) => g.lineIndices.length > 0),
    [groups, filter, q, lines]
  );
  const visibleLogs = useMemo(
    () =>
      dailyLogs
        .map((log) => ({ ...log, entries: parseDailyEntries(log.content).filter((e) => !q || e.toLowerCase().includes(q)) }))
        .filter((log) => log.entries.length > 0),
    [dailyLogs, q]
  );
  const toggleDate = (date: string) =>
    setOpenDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  if (loading) {
    return (
      <section className="grid gap-3 rounded-lg border p-4" aria-label="Agent memory">
        <h3 className="text-sm font-semibold">Agent memory</h3>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="grid gap-3 rounded-lg border p-4" aria-label="Agent memory">
        <h3 className="text-sm font-semibold">Agent memory</h3>
        <p className="text-sm text-destructive">{error}</p>
        <div>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4 rounded-lg border p-4" aria-label="Agent memory">
      <div>
        <h3 className="text-sm font-semibold">Agent memory</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          What the agent has learned about you and this workspace. Changes apply immediately.
        </p>
      </div>

      {notice && <p className={`text-sm ${notice.ok ? "text-green-500" : "text-destructive"}`}>{notice.text}</p>}

      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memories…"
          aria-label="Search memories"
          className="max-w-56"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {(["all", ...MEMORY_CATEGORIES] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              variant={filter === c ? "default" : "ghost"}
              onClick={() => setFilter(c)}
            >
              {c === "all" ? "All" : CATEGORY_LABEL[c]}
            </Button>
          ))}
        </div>
      </div>

      {visibleGroups.length === 0 && q === "" && memoryMd !== null ? (
        <EmptyState
          icon={<Brain className="h-5 w-5" />}
          title="No curated memories yet"
          hint="Ask the agent to remember something, or add one below."
        />
      ) : (
        visibleGroups.map((g) => (
          <div key={`${g.header}-${g.category}`} className="grid gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {CATEGORY_LABEL[g.category]}
            </p>
            {g.lineIndices.map((i) => (
              <div key={i} className="flex items-start justify-between gap-2 text-sm">
                {editingLine === i ? (
                  <div className="grid flex-1 gap-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      aria-label="Edit memory entry"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy !== null || !editText.trim()}
                        onClick={() => {
                          const next = [...lines];
                          next[i] = editText.trim().startsWith("-") ? editText.trim() : `- ${editText.trim()}`;
                          void saveCurated(next);
                        }}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingLine(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">{stripEntryPrefix(lines[i].replace(/^-\s*/, ""))}</span>
                    <span className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => {
                          setEditingLine(i);
                          setEditText(lines[i].replace(/^-\s*/, ""));
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => void deleteEntry(lines[i], "curated")}
                      >
                        Remove
                      </Button>
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        ))
      )}

      <div className="grid gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add a memory</p>
        <Textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="What should the agent remember?"
          aria-label="New memory content"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
            aria-label="Memory category"
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={newDurable}
              onChange={(e) => setNewDurable(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Keep long-term
          </label>
          <Button
            size="sm"
            disabled={busy !== null || !newContent.trim()}
            onClick={() => {
              const content = newContent.trim();
              void mutate("add-memory", () =>
                fetch("/api/agent/memory/record", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ content, category: newCategory, durable: newDurable }),
                }), "Memory recorded.").then((ok) => {
                if (ok) setNewContent("");
              });
            }}
          >
            Remember this
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent activity</p>
        {visibleLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {q ? "Nothing matches this search." : "No recent conversations recorded."}
          </p>
        ) : (
          visibleLogs.map((log) => (
            <div key={log.date} className="grid gap-1">
              <button
                type="button"
                onClick={() => toggleDate(log.date)}
                aria-expanded={openDates.has(log.date)}
                className="flex items-center justify-between py-1 text-left text-sm"
              >
                <span className="font-medium">{log.date}</span>
                <span className="text-xs text-muted-foreground">{log.entries.length} entries</span>
              </button>
              {openDates.has(log.date) && (
                <div className="grid gap-1.5 pl-1">
                  {log.entries.map((entry) => (
                    <div key={entry} className="flex items-start justify-between gap-2 text-sm text-muted-foreground">
                      <span className="min-w-0 flex-1">{stripEntryPrefix(entry)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => void deleteEntry(entry, "daily", log.date)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
