/**
 * Pure browser tab helpers (#350): URL normalization and agent-open
 * resolution with zero React/DOM dependencies so unit tests import this
 * module directly (never the .tsx surface).
 */

export interface BrowserTabState {
  id: string;
  url: string;
}

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "about:blank") return "about:blank";
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).toString();
    return new URL(`https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

export function shortLabel(url: string, fallback: string): string {
  if (!url) return fallback;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") || fallback;
  } catch {
    return url.length > 18 ? `${url.slice(0, 18)}…` : url;
  }
}

/** Hostname for the honest fallback card ("github.com can't be shown…"). */
export function siteNameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

export type AgentTabResolution =
  | { action: "focus"; tabId: string }
  | { action: "reuse-blank"; tabId: string }
  | { action: "create" }
  | { action: "navigate-active"; tabId: string };

/**
 * Agent-open dedup (#350): opening 3 consecutive URLs must not duplicate
 * already-opened tabs. Same normalized URL anywhere → focus that tab. Else
 * reuse a blank tab when one exists (active first), else create under the
 * cap, else navigate the active tab (cap reached, nothing to create).
 */
export function resolveAgentTab(
  tabs: BrowserTabState[],
  activeTabId: string | null,
  url: string,
  maxTabs: number
): AgentTabResolution | null {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const dupe = tabs.find((t) => {
    try {
      return t.url && normalizeUrl(t.url) === normalized;
    } catch {
      return false;
    }
  });
  if (dupe) return { action: "focus", tabId: dupe.id };
  const active = tabs.find((t) => t.id === activeTabId) ?? null;
  if (active && !active.url) return { action: "reuse-blank", tabId: active.id };
  const blank = tabs.find((t) => !t.url);
  if (blank) return { action: "reuse-blank", tabId: blank.id };
  if (tabs.length < maxTabs) return { action: "create" };
  if (active) return { action: "navigate-active", tabId: active.id };
  return null;
}
