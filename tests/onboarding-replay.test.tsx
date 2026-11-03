import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";

// Same harness contract as chat tests: motion is decorative, DOM is content.
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
(globalThis as any).HTMLDivElement = fileWindow.HTMLDivElement;
(globalThis as any).HTMLButtonElement = fileWindow.HTMLButtonElement;
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
 * Onboarding row regression (#384): with a completed tour (isOpen false,
 * step idle — exactly what skipDemo/completeDemo leave behind), the
 * mounted tab rendered null: a blank viewport that made the row look
 * dead. It must offer replay instead.
 */
describe("onboarding replay entry (#384)", () => {
  beforeEach(async () => {
    const { useOnboardingStore } = await import("../src/lib/store/useOnboardingStore");
    // Completed tour: closed + idle, the state the row click lands on.
    useOnboardingStore.setState({ isOpen: false, isPlaying: false, currentStep: "idle", hasCompleted: true } as any);
  });

  afterEach(async () => {
    const { useOnboardingStore } = await import("../src/lib/store/useOnboardingStore");
    useOnboardingStore.setState({ isOpen: false, currentStep: "idle", hasCompleted: true } as any);
  });

  it("renders a replay entry instead of blank when the tour is closed", async () => {
    const { OnboardingPluginView } = await import("../src/features/onboarding/OnboardingPluginView");
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(React.createElement(OnboardingPluginView, { onDismiss: () => {} }));
      });
      const replay = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Replay walkthrough")
      );
      expect(replay).toBeDefined();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("replay restarts the tour from the mounted tab", async () => {
    const { OnboardingPluginView } = await import("../src/features/onboarding/OnboardingPluginView");
    const { useOnboardingStore } = await import("../src/lib/store/useOnboardingStore");
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(React.createElement(OnboardingPluginView, { onDismiss: () => {} }));
      });
      const replay = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Replay walkthrough")
      ) as HTMLButtonElement;
      await act(async () => {
        replay.dispatchEvent(new (fileWindow as any).MouseEvent("click", { bubbles: true }));
      });
      const state = useOnboardingStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.currentStep).toBe("home");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
