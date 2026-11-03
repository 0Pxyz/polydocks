import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";
import { DOCK_CORE_CATALOG, migratePinnedIds } from "../src/lib/dock/dockModel";

const realFetch = globalThis.fetch;
const realConsoleError = console.error;

const fileWindow = new Window({ url: "http://localhost:3000/" });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window = fileWindow;
(globalThis as any).document = fileWindow.document;
(globalThis as any).navigator = fileWindow.navigator;
(globalThis as any).HTMLElement = fileWindow.HTMLElement;
(globalThis as any).HTMLInputElement = fileWindow.HTMLInputElement;
(globalThis as any).HTMLTextAreaElement = fileWindow.HTMLTextAreaElement;
(globalThis as any).HTMLButtonElement = fileWindow.HTMLButtonElement;
(globalThis as any).HTMLDivElement = fileWindow.HTMLDivElement;
(globalThis as any).Element = fileWindow.Element;
(globalThis as any).SVGElement = fileWindow.SVGElement;
(globalThis as any).Node = fileWindow.Node;
(globalThis as any).DocumentFragment = fileWindow.DocumentFragment;
(globalThis as any).Event = fileWindow.Event;
(globalThis as any).getComputedStyle = fileWindow.getComputedStyle.bind(fileWindow);
(globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now(), 16));
(fileWindow as any).matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});

/**
 * Notes surface contract (#351): registered in the dock catalog, survives
 * pin migration, lists workspace notes, creates, and autosaves edits.
 * Zero unhandled console errors.
 */
describe("notes surface (#351)", () => {
  let consoleErrors: string[] = [];
  let calls: Array<{ cap: string; input: any }> = [];
  let store: { items: any[] } = { items: [] };

  beforeEach(() => {
    consoleErrors = [];
    calls = [];
    store = { items: [] };
    console.error = (...args: any[]) => {
      consoleErrors.push(args.map(String).join(" "));
    };
    (globalThis as any).fetch = async (url: any, init: any) => {
      const u = String(url);
      const m = /\/api\/plugins\/notes\/(\w+)/.exec(u);
      const body = JSON.parse(String(init?.body || "{}"));
      if (!m) return { ok: true, json: async () => ({}) };
      const cap = m[1];
      calls.push({ cap, input: body });
      if (cap === "list") {
        return { ok: true, json: async () => ({ ok: true, data: { items: store.items } }) };
      }
      if (cap === "add") {
        const note = {
          id: `note_${store.items.length + 1}`,
          workspaceId: body.workspaceId,
          title: body.title,
          body: body.body ?? "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.items.unshift(note);
        return { ok: true, json: async () => ({ ok: true, id: note.id, data: note }) };
      }
      if (cap === "get") {
        const note = store.items.find((n) => n.id === body.id);
        if (!note) return { ok: false, status: 400, json: async () => ({ ok: false, error: "not found" }) };
        return { ok: true, json: async () => ({ ok: true, id: note.id, data: note }) };
      }
      if (cap === "update") {
        const note = store.items.find((n) => n.id === body.id);
        if (!note) return { ok: false, status: 400, json: async () => ({ ok: false, error: "not found" }) };
        if (typeof body.title === "string") note.title = body.title;
        if (typeof body.body === "string") note.body = body.body;
        note.updatedAt = new Date().toISOString();
        return { ok: true, json: async () => ({ ok: true, id: note.id, data: { ...note } }) };
      }
      return { ok: false, status: 404, json: async () => ({ ok: false, error: "unknown" }) };
    };
  });

  afterEach(() => {
    (globalThis as any).fetch = realFetch;
    console.error = realConsoleError;
  });

  it("is a first-class dock tool that survives pin migration", () => {
    expect(DOCK_CORE_CATALOG.map((d) => d.id)).toContain("notes");
    expect(migratePinnedIds(["agent", "notes", "browser", "settings"])).toContain("notes");
  });

  async function renderNotes() {
    const { NotesView } = await import("../src/features/notes/NotesView");
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(NotesView, { workspaceKey: "home" }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    return { container, root };
  }

  it("lists notes and creates a new one", async () => {
    store.items = [
      { id: "note_1", workspaceId: "w", title: "Research", body: "hello", createdAt: "", updatedAt: "" },
    ];
    const { container, root } = await renderNotes();
    try {
      expect(container.textContent || "").toContain("Research");
      const buttons = Array.from(container.querySelectorAll("button"));
      const create = buttons.find((b) => (b.textContent || "").includes("New note"))!;
      expect(create).toBeDefined();
      await act(async () => {
        create.dispatchEvent(new (fileWindow as any).MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(calls.some((c) => c.cap === "add")).toBe(true);
      expect(container.textContent || "").toContain("Untitled note");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("autosaves title edits with debounce", async () => {
    store.items = [
      { id: "note_1", workspaceId: "w", title: "Research", body: "hello", createdAt: "", updatedAt: "" },
    ];
    const { container, root } = await renderNotes();
    try {
      const input = container.querySelector('input[aria-label="Note title"]') as any;
      expect(input).toBeDefined();
      await act(async () => {
        input.focus();
      });
      // happy-dom input event path for React controlled inputs.
      const nativeSetter = Object.getOwnPropertyDescriptor(fileWindow.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(input, "Research v2");
      input.dispatchEvent(new (fileWindow as any).Event("input", { bubbles: true }));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1100));
      });
      const updates = calls.filter((c) => c.cap === "update");
      expect(updates.length).toBeGreaterThan(0);
      expect(updates.at(-1)!.input.title).toBe("Research v2");
      expect(container.textContent || "").not.toContain("Save failed");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("hydrates title and body from the list on mount (reload path, #400)", async () => {
    store.items = [
      { id: "note_1", workspaceId: "w", title: "Research", body: "hello body", createdAt: "", updatedAt: "" },
    ];
    const { container, root } = await renderNotes();
    try {
      const input = container.querySelector('input[aria-label="Note title"]') as any;
      const area = container.querySelector('textarea[aria-label="Note body (Markdown)"]') as any;
      expect(input?.value).toBe("Research");
      expect(area?.value).toBe("hello body");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("flushes an unsaved draft on unmount without waiting for the debounce (#400)", async () => {
    store.items = [
      { id: "note_1", workspaceId: "w", title: "Research", body: "hello", createdAt: "", updatedAt: "" },
    ];
    const { container, root } = await renderNotes();
    const area = container.querySelector('textarea[aria-label="Note body (Markdown)"]') as any;
    expect(area).toBeDefined();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      (fileWindow as any).HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(area, "typed then closed");
    area.dispatchEvent(new (fileWindow as any).Event("input", { bubbles: true }));
    // Unmount immediately: the 800ms debounce never fires on its own.
    await act(async () => {
      root.unmount();
    });
    container.remove();
    const updates = calls.filter((c) => c.cap === "update");
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.at(-1)!.input.body).toBe("typed then closed");
  });

  it("emits no unhandled console errors", async () => {
    const { container, root } = await renderNotes();
    try {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      const fatal = consoleErrors.filter((m) => !m.includes("act("));
      expect(fatal).toEqual([]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
