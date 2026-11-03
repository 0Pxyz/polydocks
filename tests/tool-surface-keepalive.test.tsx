import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";

// Surfaces animate via motion; content is what matters here.
mock.module("motion/react", () => {
  const Plain = ({ children, ...props }: any) => {
    const {
      animate: _animate,
      transition: _transition,
      variants: _variants,
      initial: _initial,
      exit: _exit,
      whileHover: _whileHover,
      whileTap: _whileTap,
      layout: _layout,
      layoutId: _layoutId,
      ...rest
    } = props;
    return React.createElement("div", rest, children);
  };
  const motionProxy = new Proxy(
    {},
    {
      get: () => Plain,
    }
  );
  const AnimatePresence = ({ children }: any) => React.createElement(React.Fragment, null, children);
  return { motion: motionProxy, AnimatePresence };
});

const fileWindow = new Window({ url: "http://localhost:3000/" });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window = fileWindow;
(globalThis as any).document = fileWindow.document;
(globalThis as any).navigator = fileWindow.navigator;
(globalThis as any).HTMLElement = fileWindow.HTMLElement;
(globalThis as any).Element = fileWindow.Element;
(globalThis as any).SVGElement = fileWindow.SVGElement;
(globalThis as any).Node = fileWindow.Node;
(globalThis as any).DocumentFragment = fileWindow.DocumentFragment;
(globalThis as any).KeyboardEvent = fileWindow.KeyboardEvent;
(globalThis as any).Event = fileWindow.Event;
(globalThis as any).getComputedStyle = fileWindow.getComputedStyle.bind(fileWindow);
(globalThis as any).ResizeObserver = (fileWindow as any).ResizeObserver;
(globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16);
(fileWindow as any).matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});

const realFetch = globalThis.fetch;
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).fetch = async (url: any) => {
    const u = String(url);
    const data = u.includes("/api/plugins/notes/")
      ? { items: [] }
      : u.includes("/api/account/")
        ? { memberships: [], user: null, status: {} }
        : u.includes("/api/agent/memory")
          ? { memories: [] }
          : u.includes("/api/plugins?")
            ? { plugins: [] }
            : {};
    return { ok: true, json: async () => ({ ok: true, data }) };
  };
});
afterEach(async () => {
  (globalThis as any).fetch = realFetch;
});

function CounterTab() {
  const [n, setN] = React.useState(0);
  return (
    <div>
      <span data-testid="keepalive-count">{n}</span>
      <button data-testid="keepalive-inc" type="button" onClick={() => setN((v) => v + 1)}>
        inc
      </button>
    </div>
  );
}

/**
 * Keep-alive contract: an open sandbox tab keeps running when the user
 * navigates to another surface. Switching toolId away must hide — never
 * unmount — the tab, so in-memory state (timers, drafts, counters)
 * survives the round trip.
 */
describe("sandbox keep-alive across surfaces", () => {
  it("switching to a builtin surface keeps the sandbox tab mounted with its state", async () => {
    const { ToolSurface } = await import("../src/features/dock/ToolSurface");
    const { createRoot } = await import("react-dom/client");
    const tabs = [{ id: "probe-tab", render: () => React.createElement(CounterTab) }];
    const baseProps = {
      sandboxTabs: tabs,
      sandboxActiveId: "probe-tab",
      onDismiss: () => {},
      onOpenPlugin: () => {},
      onSelectTool: () => {},
      pluginsInitialTab: "installed",
    } as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(React.createElement(ToolSurface, { ...baseProps, toolId: "probe-tab" }));
      });
      const count = container.querySelector('[data-testid="keepalive-count"]');
      expect(count?.textContent).toBe("0");
      const inc = container.querySelector('[data-testid="keepalive-inc"]') as HTMLElement;
      expect(inc).not.toBeNull();
      await act(async () => {
        inc.dispatchEvent(new (globalThis as any).Event("click", { bubbles: true }));
      });
      expect(container.querySelector('[data-testid="keepalive-count"]')?.textContent).toBe("1");

      // Navigate away to a builtin surface (the reported focus-timer case).
      await act(async () => {
        root.render(React.createElement(ToolSurface, { ...baseProps, toolId: "notes" }));
        await new Promise((r) => setTimeout(r, 50));
      });

      // The sandbox tab host is still in the DOM (hidden), with its state.
      const host = container.querySelector('[data-tab-host-id="probe-tab"]');
      expect(host).not.toBeNull();
      expect(host?.getAttribute("data-tab-host-active")).toBe("false");
      expect(container.querySelector('[data-testid="keepalive-count"]')?.textContent).toBe("1");

      // Navigate back: state intact, no remount.
      await act(async () => {
        root.render(React.createElement(ToolSurface, { ...baseProps, toolId: "probe-tab" }));
      });
      expect(container.querySelector('[data-tab-host-id="probe-tab"]')?.getAttribute("data-tab-host-active")).toBe(
        "true"
      );
      expect(container.querySelector('[data-testid="keepalive-count"]')?.textContent).toBe("1");
    } finally {
      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    }
  });

  it("open builtin views stay mounted across navigation (notes keep their editor state)", async () => {
    const { ToolSurface } = await import("../src/features/dock/ToolSurface");
    const { useDockStore } = await import("../src/lib/store/useDockStore");
    const { createRoot } = await import("react-dom/client");
    const dock = useDockStore.getState();
    dock.openTool("notes");
    dock.openTool("settings");
    const baseProps = {
      sandboxTabs: [],
      sandboxActiveId: null,
      keepBuiltinsAlive: true,
      onDismiss: () => {},
      onOpenPlugin: () => {},
      onSelectTool: () => {},
      pluginsInitialTab: "installed",
    } as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(React.createElement(ToolSurface, { ...baseProps, toolId: "notes" }));
        await new Promise((r) => setTimeout(r, 50));
      });
      const editor = container.querySelector(
        'textarea[aria-label="Note body (Markdown)"]'
      ) as HTMLTextAreaElement | null;
      expect(editor).not.toBeNull();

      // Navigate to settings: notes must stay in the DOM, hidden.
      await act(async () => {
        root.render(React.createElement(ToolSurface, { ...baseProps, toolId: "settings" }));
        await new Promise((r) => setTimeout(r, 50));
      });
      const hiddenEditor = container.querySelector(
        'textarea[aria-label="Note body (Markdown)"]'
      ) as HTMLTextAreaElement | null;
      expect(hiddenEditor).not.toBeNull();
      expect(hiddenEditor!.closest("div[hidden]")).not.toBeNull();

      // Navigate back: same node, visible again.
      await act(async () => {
        root.render(React.createElement(ToolSurface, { ...baseProps, toolId: "notes" }));
        await new Promise((r) => setTimeout(r, 50));
      });
      const backEditor = container.querySelector(
        'textarea[aria-label="Note body (Markdown)"]'
      ) as HTMLTextAreaElement | null;
      expect(backEditor).toBe(hiddenEditor);
      expect(backEditor!.closest("div[hidden]")).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
      useDockStore.getState().closeTool("notes");
      useDockStore.getState().closeTool("settings");
    }
  });
});
