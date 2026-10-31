import { getAgentUserId } from "@/lib/agent/thread";

export interface BrowserSession {
  sessionId: string;
  viewerToken: string;
  wsUrl: string;
  expiresAt: number;
}

function headers(workspaceKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Polymax-User": getAgentUserId(),
    "X-Polymax-Workspace": workspaceKey,
  };
}

/** Rewrite a server-issued ws(s) URL to the current page origin when it points at the same app. */
export function resolveViewerWsUrl(wsUrl: string): string {
  try {
    const u = new URL(wsUrl);
    if (typeof window === "undefined") return wsUrl;
    const loc = window.location;
    // Dev: API runs on :3000 behind Vite :5173 proxy. The server-issued URL
    // already points at :3000, which is directly reachable — keep it.
    // Prod: single origin — align scheme/host to the page to survive proxies.
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return wsUrl;
    const proto = loc.protocol === "https:" ? "wss:" : "ws:";
    if (u.host !== loc.host) {
      u.protocol = proto;
      u.host = loc.host;
    }
    return u.toString();
  } catch {
    return wsUrl;
  }
}

export async function createBrowserSession(
  workspaceKey: string,
  initialUrl?: string,
  viewport?: { w: number; h: number }
): Promise<BrowserSession> {
  const res = await fetch("/api/browser/atrium/sessions", {
    method: "POST",
    headers: headers(workspaceKey),
    body: JSON.stringify(initialUrl || viewport ? { initialUrl, viewport } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`browser_create_${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as BrowserSession;
  if (!data.sessionId || !data.viewerToken || !data.wsUrl) {
    throw new Error("browser_bad_session");
  }
  return data;
}

export async function getBrowserSession(
  workspaceKey: string,
  sessionId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/browser/atrium/sessions/${encodeURIComponent(sessionId)}`,
      { headers: headers(workspaceKey) }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function destroyBrowserSession(
  workspaceKey: string,
  sessionId: string
): Promise<void> {
  await fetch(`/api/browser/atrium/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: headers(workspaceKey),
  }).catch(() => undefined);
}

export async function navigateBrowserSession(
  workspaceKey: string,
  sessionId: string,
  url: string
): Promise<void> {
  const res = await fetch(
    `/api/browser/atrium/sessions/${encodeURIComponent(sessionId)}/navigate`,
    {
      method: "POST",
      headers: headers(workspaceKey),
      body: JSON.stringify({ url }),
    }
  );
  if (!res.ok) throw new Error(`browser_navigate_${res.status}`);
}

export async function grantBrowserControl(
  workspaceKey: string,
  sessionId: string
): Promise<void> {
  await fetch(
    `/api/browser/atrium/sessions/${encodeURIComponent(sessionId)}/control`,
    {
      method: "POST",
      headers: headers(workspaceKey),
      body: JSON.stringify({ action: "grant", to: "human" }),
    }
  ).catch(() => undefined);
}

export async function browserHealth(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch("/api/browser/atrium/health");
    if (!res.ok) return { configured: false };
    return (await res.json()) as { configured: boolean };
  } catch {
    return { configured: false };
  }
}
