import { describe, it, expect } from "bun:test";
import {
  normalizeUrl,
  shortLabel,
  siteNameOf,
  resolveAgentTab,
} from "../src/features/browser/browserTabs";

/**
 * Browser tab dedup contract (#350): Poly opening consecutive URLs must not
 * duplicate already-opened tabs. Pure logic — no DOM, no worker.
 */
describe("browser tab dedup (#350)", () => {
  it("normalizes URLs for comparison", () => {
    expect(normalizeUrl("  ")).toBeNull();
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
    expect(normalizeUrl("https://en.wikipedia.org/wiki/Raft")).toBe("https://en.wikipedia.org/wiki/Raft");
    expect(normalizeUrl("ABOUT:BLANK")).toBe("about:blank");
    expect(normalizeUrl("not a url \\")).toBeNull();
  });

  it("labels and site names fall back honestly", () => {
    expect(shortLabel("https://www.mdn.dev/x", "New tab")).toBe("mdn.dev");
    expect(shortLabel("", "New tab")).toBe("New tab");
    expect(siteNameOf("https://github.com/x")).toBe("github.com");
    expect(siteNameOf("garbage")).toBe("garbage");
  });

  it("focuses the existing tab for a duplicate URL", () => {
    const tabs = [
      { id: "tab-1", url: "https://en.wikipedia.org/wiki/Raft" },
      { id: "tab-2", url: "https://arxiv.org/abs/1234" },
    ];
    // Trailing-slash / scheme variants still match.
    expect(resolveAgentTab(tabs, "tab-1", "en.wikipedia.org/wiki/Raft", 5)).toEqual({
      action: "focus",
      tabId: "tab-1",
    });
    expect(resolveAgentTab(tabs, "tab-1", "https://arxiv.org/abs/1234", 5)).toEqual({
      action: "focus",
      tabId: "tab-2",
    });
  });

  it("opens 3 consecutive fresh URLs as 3 creates", () => {
    let tabs = [{ id: "tab-1", url: "" }];
    let active: string | null = "tab-1";
    const opened: string[] = [];
    for (const url of ["https://a.example/", "https://b.example/", "https://c.example/"]) {
      const r = resolveAgentTab(tabs, active, url, 5)!;
      if (r.action === "reuse-blank") {
        tabs = tabs.map((t) => (t.id === (r as any).tabId ? { ...t, url } : t));
        active = (r as any).tabId;
      } else if (r.action === "create") {
        const id = `tab-${tabs.length + 1}`;
        tabs = [...tabs, { id, url }];
        active = id;
      }
      opened.push(active!);
    }
    expect(tabs.map((t) => t.url)).toEqual([
      "https://a.example/",
      "https://b.example/",
      "https://c.example/",
    ]);
    expect(new Set(opened).size).toBe(3);
  });

  it("reuses a blank tab instead of creating", () => {
    const tabs = [
      { id: "tab-1", url: "https://a.example/" },
      { id: "tab-2", url: "" },
    ];
    expect(resolveAgentTab(tabs, "tab-1", "https://b.example/", 5)).toEqual({
      action: "reuse-blank",
      tabId: "tab-2",
    });
  });

  it("navigates the active tab when the cap is reached", () => {
    const tabs = [
      { id: "tab-1", url: "https://a.example/" },
      { id: "tab-2", url: "https://b.example/" },
    ];
    expect(resolveAgentTab(tabs, "tab-1", "https://c.example/", 2)).toEqual({
      action: "navigate-active",
      tabId: "tab-1",
    });
  });

  it("returns null for garbage input", () => {
    expect(resolveAgentTab([], null, "   ", 5)).toBeNull();
    expect(resolveAgentTab([], null, "https://a.example/", 5)).toEqual({ action: "create" });
    // No tabs and no active: create is the only option under cap.
    expect(resolveAgentTab([], "tab-9", "https://a.example/", 5)).toEqual({ action: "create" });
  });
});
