import { useCallback, useEffect, useRef, useState } from "react";
import { useTabState } from "@/lib/tabs/useTabState";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";

interface NoteItem {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface NotesViewProps {
  workspaceKey?: string;
  className?: string;
}

/** Envelope shared by POST /api/plugins/notes/* (facade contract). */
async function callNotes<T>(capability: string, input: Record<string, unknown>): Promise<T> {
  const wsId = useWorkspaceStore.getState().activeWorkspaceId || "default";
  const res = await fetch(`/api/plugins/notes/${capability}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, workspaceId: wsId }),
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Notes ${capability} failed (HTTP ${res.status})`);
  }
  return json.data as T;
}

function savedLabel(iso: string | null): string {
  if (!iso) return "Not saved yet";
  try {
    return `Saved ${new Date(iso).toLocaleTimeString()}`;
  } catch {
    return "Saved";
  }
}

/**
 * Minimal first-party Notes surface (#351): note list + title + markdown
 * editor, autosaved (debounced) to the workspace SQLite database via the
 * notes capabilities. Selected note id persists in tab state so switching
 * dock surfaces never loses the draft; the editor is uncontrolledreset-free
 * (server echoes back, local keystrokes never clobbered by refetch).
 */
export function NotesView({ workspaceKey = "home", className = "" }: NotesViewProps) {
  const tabId = `notes:${workspaceKey}`;
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [selectedId, setSelectedId] = useTabState<string | null>(tabId, "selected", null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"pristine" | "dirty" | "saving" | "saved" | "error">("pristine");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingId = useRef<string | null>(null);
  // Latest unsaved draft for the unload flush below. Set whenever the
  // debounced save is (re)scheduled, cleared when it lands.
  const pendingSave = useRef<{ id: string; title: string; body: string } | null>(null);

  const refreshList = useCallback(async () => {
    const data = await callNotes<{ items: NoteItem[] }>("list", {});
    setNotes(data.items || []);
    return data.items || [];
  }, []);

  // Initial load: list notes, select the first (or the persisted tab-state
  // selection when it still exists). One-shot per mount.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    refreshList()
      .then((items) => {
        if (cancelled) return;
        const wanted = selectedId && items.some((n) => n.id === selectedId) ? selectedId : items[0]?.id ?? null;
        if (wanted) {
          setSelectedId(wanted);
          const note = items.find((n) => n.id === wanted);
          if (note) {
            editingId.current = note.id;
            setTitle(note.title);
            setBody(note.body);
            setSavedAt(note.updatedAt);
            setSaveState("saved");
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load notes");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching notes hydrates the editor from the cached list row (list
  // carries full bodies), then a full get as a refresh.
  const selectNote = useCallback(
    async (id: string) => {
      const cached = notes.find((n) => n.id === id);
      pendingSave.current = null;
      setSelectedId(id);
      editingId.current = id;
      if (cached) {
        setTitle(cached.title);
        setBody(cached.body);
        setSavedAt(cached.updatedAt);
        setSaveState("saved");
      }
      try {
        const full = await callNotes<NoteItem>("get", { id });
        if (editingId.current !== id) return;
        setTitle(full.title);
        setBody(full.body);
        setSavedAt(full.updatedAt);
        setSaveState("saved");
      } catch {
        // Cached row already rendered; a failed refresh never blanks it.
      }
    },
    [notes, setSelectedId]
  );

  // Debounced autosave: update title/body 800ms after the last keystroke.
  // Guarded by editingId so a mid-save note switch never writes into the
  // wrong note or resurrects a stale draft over fresh content. Only "dirty"
  // (user keystrokes) schedules a save — programmatic hydration lands on
  // "saved" and never echoes back to the server.
  useEffect(() => {
    if (saveState !== "dirty" || !editingId.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = editingId.current;
    const nextTitle = title;
    const nextBody = body;
    pendingSave.current = { id, title: nextTitle, body: nextBody };
    saveTimer.current = setTimeout(() => {
      setSaveState("saving");
      callNotes<NoteItem>("update", { id, title: nextTitle, body: nextBody })
        .then((updated) => {
          const pending = pendingSave.current;
          if (pending && pending.id === id && pending.title === nextTitle && pending.body === nextBody) {
            pendingSave.current = null;
          }
          if (editingId.current !== id) return;
          setSavedAt(updated.updatedAt);
          setSaveState("saved");
          setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: updated.title, body: updated.body, updatedAt: updated.updatedAt } : n)));
        })
        .catch(() => {
          if (editingId.current === id) setSaveState("error");
        });
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, saveState]);

  // Flush-on-exit (#400): a reload or tab close inside the 800ms debounce
  // window would otherwise drop the draft — the timer cleanup above only
  // cancels. beforeunload fires synchronously, so the write goes out with
  // keepalive (no state updates: the tree may already be gone). Unmount
  // (explicit close) flushes the same way.
  useEffect(() => {
    const flush = () => {
      const pending = pendingSave.current;
      if (!pending) return;
      pendingSave.current = null;
      const wsId = useWorkspaceStore.getState().activeWorkspaceId || "default";
      void fetch("/api/plugins/notes/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pending, workspaceId: wsId }),
        keepalive: true,
      }).catch(() => {
        // Unload path: nothing left to report to.
      });
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  const handleNew = useCallback(async () => {
    pendingSave.current = null;
    try {
      const created = await callNotes<NoteItem>("add", { title: "Untitled note", body: "" });
      setNotes((prev) => [created, ...prev]);
      setSelectedId(created.id);
      editingId.current = created.id;
      setTitle(created.title);
      setBody(created.body);
      setSavedAt(created.updatedAt);
      setSaveState("saved");
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Could not create a note");
    }
  }, [setSelectedId]);

  const markDirty = () => {
    // A keystroke during an in-flight save flips back to dirty so the
    // effect schedules a follow-up with the latest content; the in-flight
    // write landing first is harmless (same note, older content first).
    setSaveState("dirty");
  };

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  return (
    <div data-notes-view className={`w-full h-full flex-1 min-w-0 min-h-0 flex font-sans ${className}`}>
      {/* Note list rail. */}
      <div role="listbox" aria-label="Notes" className="w-40 md:w-52 shrink-0 flex flex-col gap-1 overflow-y-auto pr-1">
        {loading && (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground" aria-live="polite">
            <span className="w-4 h-4 rounded-full border-2 border-muted border-t-primary animate-spin" />
            Loading…
          </div>
        )}
        {!loading &&
          notes.map((n) => {
            const isActive = n.id === selectedId;
            return (
              <button
                key={n.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => void selectNote(n.id)}
                title={n.title}
                className={`text-left px-2.5 py-2 rounded-xl border cursor-pointer truncate ${
                  isActive
                    ? "bg-muted border-border text-foreground"
                    : "bg-transparent border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <span className="block text-[13px] font-medium truncate">{n.title || "Untitled note"}</span>
              </button>
            );
          })}
        {!loading && notes.length === 0 && !loadError && (
          <p className="px-2 py-3 text-xs text-muted-foreground">No notes yet — create one below.</p>
        )}
        {loadError && <p className="px-2 py-2 text-xs text-destructive">{loadError}</p>}
        <button
          type="button"
          onClick={() => void handleNew()}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer text-xs"
        >
          <span className="text-base leading-none">+</span> New note
        </button>
      </div>

      {/* Editor. Always rendered (host-owned lifecycle): empty state is an
          explicit message, never a blank or conditionally missing tree. */}
      <div className="flex-1 min-w-0 flex flex-col pl-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
            placeholder="Note title"
            aria-label="Note title"
            disabled={!selected}
            className="flex-1 h-9 px-3 rounded-xl bg-muted/50 border border-border text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50"
          />
          <span className="text-[11px] text-muted-foreground shrink-0" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed — retry by typing" : savedLabel(savedAt)}
          </span>
        </div>
        {!selected && !loading && (
          <p className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            Select a note or create one to start writing.
          </p>
        )}
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            markDirty();
          }}
          placeholder={selected ? "Write in Markdown…" : ""}
          aria-label="Note body (Markdown)"
          disabled={!selected}
          spellCheck={false}
          className="flex-1 min-h-0 mt-2 w-full resize-none rounded-xl bg-muted/30 border border-border px-3 py-2.5 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50"
        />
      </div>
    </div>
  );
}
