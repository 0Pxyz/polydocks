import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";

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
  removeEventListener() {},
  addEventListener() {},
  removeEventListener() {},
});

const SYS_MD = [
  "# Long-Term Curated Memory",
  "",
  "## Architectural Guidelines",
  "- Everything is a capability behind a typed contract on the capability bus.",
  "- The persistent agent home (`agent-home/`) isolates operational data.",
  "",
  "## Preferences",
  "- Prefers concise answers with examples.",
  "",
].join("\n");

const realFetch = globalThis.fetch;
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).fetch = async (input: any) => {
    const url = String(input?.url ?? input);
    if (url.includes("/api/agent/memory")) {
      return { ok: true, json: async () => ({ memoryMd: SYS_MD, dailyLogs: [] }) };
    }
    if (url.includes("/api/account/status")) {
      return { ok: true, json: async () => ({ signedIn: false, providers: { google: false, github: false } }) };
    }
    if (url.includes("/api/account/memberships")) {
      return { ok: true, json: async () => ({ success: true, memberships: [] }) };
    }
    return { ok: true, json: async () => ({}) };
  };
});
afterEach(() => {
  (globalThis as any).fetch = realFetch;
});

async function mount(node: React.ReactNode) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node as any);
    await new Promise((r) => setTimeout(r, 80));
  });
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  };
  return { container, cleanup };
}

/**
 * Settings sheet contract (#326): borderless sections, curated memories
 * (no baseline system rules), compact account row with in-place expand.
 */
describe("settings sheet (#326)", () => {
  it("filters baseline system sections from the memory list", async () => {
    const { isSystemMemoryGroup } = await import("../src/features/settings/MemoryInspectorView");
    expect(isSystemMemoryGroup("## Architectural Guidelines")).toBe(true);
    expect(isSystemMemoryGroup("## Preferences")).toBe(false);
    expect(isSystemMemoryGroup("## SYSTEM")).toBe(true);
  });

  it("renders user memories without system rules and without boxed cards", async () => {
    const { SettingsView } = await import("../src/features/settings/SettingsView");
    const { container, cleanup } = await mount(React.createElement(SettingsView, {}));
    const text = container.textContent ?? "";
    expect(text).toContain("Prefers concise answers");
    expect(text).not.toContain("Everything is a capability");
    expect(text).not.toContain("agent-home/");
    // No heavy boxed section chrome: sections are spacing groups now.
    const boxed = Array.from(container.querySelectorAll("*")).filter((el) => {
      const cls = String((el as any).className || "").split(/\s+/);
      return cls.includes("rounded-lg") && cls.includes("border") && !cls.some((c) => c.startsWith("border-destructive"));
    });
    expect(boxed).toEqual([]);
    await cleanup();
  });

  it("keeps sign-in collapsed until requested", async () => {
    const { SettingsView } = await import("../src/features/settings/SettingsView");
    const { container, cleanup } = await mount(React.createElement(SettingsView, {}));
    expect(container.textContent).toContain("Local workspace");
    expect(container.querySelector('input[type="password"]')).toBeNull();
    const trigger = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent || "").includes("Sign in / Create account")
    );
    expect(trigger).toBeDefined();
    await act(async () => {
      (trigger as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    await cleanup();
  });
});
