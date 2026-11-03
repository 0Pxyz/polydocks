import { create } from "zustand";

/**
 * Cross-surface note navigation (#402): one shared request consumed by the
 * Notes surface. Every entry point (palette row, agent dock.open with a
 * noteId, dock focus) funnels through requestNote — the surface selects
 * the note or shows a visible error, never failing silently.
 */
interface NotesNavState {
  /** Note id requested but not yet consumed by the Notes surface. */
  pendingNoteId: string | null;
  requestNote: (id: string) => void;
  /** Take (and clear) the pending request. Returns null when none. */
  consumeNote: () => string | null;
}

export const useNotesNavStore = create<NotesNavState>((set, get) => ({
  pendingNoteId: null,
  requestNote: (id) => {
    if (typeof id === "string" && id) set({ pendingNoteId: id });
  },
  consumeNote: () => {
    const id = get().pendingNoteId;
    if (!id) return null;
    set({ pendingNoteId: null });
    return id;
  },
}));
