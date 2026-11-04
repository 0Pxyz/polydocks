import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";

/**
 * Spotlight rect guard (#URGENT onboarding ghost): the tour's highlight
 * ring must never render over empty space. resolveSpotRect returns null
 * when the target is missing or has no box, so the ring hides instead of
 * floating where the target used to be (beside open/close reflows the
 * dock without scroll/resize events).
 */

const fileWindow = new Window({ url: "http://localhost:3000/" });
(globalThis as any).window = fileWindow;
(globalThis as any).document = fileWindow.document;
(globalThis as any).navigator = fileWindow.navigator;
(globalThis as any).HTMLElement = fileWindow.HTMLElement;
(globalThis as any).Element = fileWindow.Element;

import { resolveSpotRect } from "../src/lib/onboarding/demoScript";

beforeEach(() => {
  fileWindow.document.body.innerHTML = "";
});

describe("resolveSpotRect", () => {
  it("returns null for a null selector", () => {
    expect(resolveSpotRect(null)).toBeNull();
  });

  it("returns null when no element matches", () => {
    expect(resolveSpotRect('[data-dock-tool-id="nope"]')).toBeNull();
  });

  it("returns null when the target has no box (hidden or unlaid-out)", () => {
    const el = fileWindow.document.createElement("button");
    el.setAttribute("data-dock-tool-id", "settings");
    fileWindow.document.body.appendChild(el);
    // happy-dom has no layout: zero rect must hide the ring, not float it.
    expect(resolveSpotRect('[data-dock-tool-id="settings"]')).toBeNull();
  });

  it("returns the box when the target is visible", () => {
    const el = fileWindow.document.createElement("button");
    el.setAttribute("data-dock-tool-id", "settings");
    fileWindow.document.body.appendChild(el);
    el.getBoundingClientRect = () =>
      ({ x: 100, y: 40, width: 40, height: 40, top: 40, left: 100, right: 140, bottom: 80, toJSON: () => ({}) }) as DOMRect;
    expect(resolveSpotRect('[data-dock-tool-id="settings"]')).toEqual({
      x: 100,
      y: 40,
      width: 40,
      height: 40,
    });
  });
});
