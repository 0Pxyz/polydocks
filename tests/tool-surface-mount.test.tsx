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
(globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16);
(fileWindow as any).matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});

async function mount(node: React.ReactNode) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node as any);
  });
  const html = container.innerHTML;
  const text = container.textContent ?? "";
  await act(async () => {
    root.unmount();
  });
  document.body.removeChild(container);
  return { html, text };
}

/**
 * ToolSurface mount contract (#319): a surface mount never renders blank.
 * Dev-only and unknown ids explain themselves; crashes show the boundary.
 * (Under bun, import.meta.env.DEV is unset, so the inspect branch under
 * test is the production one — exactly the blank path from the issue.)
 */
describe("tool surface mount contract (#319)", () => {
  it("inspect explains itself instead of mounting blank outside DEV", async () => {
    const { ToolSurface } = await import("../src/features/dock/ToolSurface");
    const { html, text } = await mount(
      React.createElement(ToolSurface, {
        toolId: "inspect",
        sandboxTabs: [],
        sandboxActiveId: null,
        onDismiss: () => {},
        onOpenPlugin: () => {},
        onSelectTool: () => {},
        pluginsInitialTab: "installed",
      } as any)
    );
    expect(html.trim().length).toBeGreaterThan(0);
    expect(text).toContain("dev-only");
  });

  it("unknown tool ids name the missing view instead of blank", async () => {
    const { ToolSurface } = await import("../src/features/dock/ToolSurface");
    const { html, text } = await mount(
      React.createElement(ToolSurface, {
        toolId: "no-such-tool",
        sandboxTabs: [],
        sandboxActiveId: null,
        onDismiss: () => {},
        onOpenPlugin: () => {},
        onSelectTool: () => {},
        pluginsInitialTab: "installed",
      } as any)
    );
    expect(html.trim().length).toBeGreaterThan(0);
    expect(text).toContain("No view component registered");
    expect(text).toContain("no-such-tool");
  });

  it("a crashing surface shows the boundary, not blank space", async () => {
    const { SurfaceErrorBoundary } = await import("../src/components/ui/surface-error-boundary");
    function Boom(): React.ReactNode {
      throw new Error("kaboom");
    }
    const { html, text } = await mount(
      React.createElement(SurfaceErrorBoundary, { toolId: "probe" }, React.createElement(Boom as any))
    );
    expect(html.trim().length).toBeGreaterThan(0);
    expect(text).toContain("crashed instead of rendering");
    expect(text).toContain("kaboom");
  });

  it("InspectView mounts its empty state with no session", async () => {
    const { InspectView } = await import("../src/features/inspect/InspectView");
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    useConversationStore.setState({ orchestratorSessionId: null } as any);
    const { html, text } = await mount(React.createElement(InspectView));
    expect(html.trim().length).toBeGreaterThan(0);
    expect(text).toContain("No runtime session yet");
  });
});
