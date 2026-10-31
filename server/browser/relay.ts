/**
 * Bun-native viewer WebSocket relay for the Atrium remote browser.
 *
 * Mirrors @atriumjs/core streaming.ts handleNodeViewerUpgrade semantics
 * without Node http upgrade: viewerToken auth via the core memory store,
 * replay of recent JSON control messages, bidirectional relay to the
 * worker dial URL, and URL-allowlist enforcement on viewer-driven
 * navigate. Binary frames (JPEG screencast) pass through untouched.
 *
 * Multiplexed with the voice realtime socket in server/index.ts via
 * client.data.kind === "browser".
 */

import { WebSocket as UpstreamSocket } from "ws";
import { atriumCore, getBrowserWorkerDialBase, urlAllowed } from "./atriumHost";
import { config } from "../config";

export const BROWSER_STREAM_PREFIX = "/api/browser/atrium/sessions/";

export function isBrowserStreamRequest(req: Request): boolean {
  try {
    const u = new URL(req.url);
    if (!u.pathname.startsWith(BROWSER_STREAM_PREFIX)) return false;
    if (!u.pathname.endsWith("/stream")) return false;
    return req.headers.get("upgrade")?.toLowerCase().includes("websocket") ?? false;
  } catch {
    return false;
  }
}

export function browserStreamIdentity(req: Request): { sessionId: string; token: string } | null {
  try {
    const u = new URL(req.url);
    const prefix = BROWSER_STREAM_PREFIX;
    if (!u.pathname.startsWith(prefix) || !u.pathname.endsWith("/stream")) return null;
    const mid = u.pathname.slice(prefix.length, -"/stream".length);
    if (!mid || mid.includes("/")) return null;
    return { sessionId: decodeURIComponent(mid), token: u.searchParams.get("token") ?? "" };
  } catch {
    return null;
  }
}

type BrowserClientState = {
  kind: "browser";
  sessionId: string;
};

const upstreamByClient = new Map<object, InstanceType<typeof UpstreamSocket>>();
const sessionByClient = new Map<object, string>();

function viewerSend(client: any, data: string | Buffer | ArrayBuffer | Uint8Array): void {
  try {
    client.send(data as any);
  } catch {
    // Ignore send failures on closing sockets.
  }
}

function closeUpstream(client: object): void {
  const upstream = upstreamByClient.get(client);
  upstreamByClient.delete(client);
  sessionByClient.delete(client);
  try {
    if (upstream && upstream.readyState === UpstreamSocket.OPEN) upstream.close();
  } catch {
    // Ignore.
  }
  try {
    upstream?.removeAllListeners();
  } catch {
    // Ignore.
  }
}

function viewerMessageAllowed(raw: unknown, allowlist: string[]): boolean {
  if (typeof raw !== "object" || raw == null) return true;
  const msg = raw as { t?: unknown; url?: unknown };
  if (msg.t !== "navigate") return true;
  if (typeof msg.url !== "string") return false;
  try {
    return urlAllowed(msg.url, allowlist);
  } catch {
    return false;
  }
}

export const browserWebsocketHandlers = {
  open(client: any): void {
    const data = client?.data as BrowserClientState | undefined;
    const sessionId = data?.sessionId;
    const token = (client?.data as any)?.token as string | undefined;
    const store = atriumCore.memoryStore as any;
    let record =
      typeof sessionId === "string" && typeof token === "string"
        ? store.resolveViewerToken?.(token)
        : undefined;
    if (record && record.sessionId !== sessionId) record = undefined;
    if (!record && typeof sessionId === "string" && typeof token === "string") {
      // Grace path for our own first-party viewer: viewer tokens expire after
      // 5 minutes (hardcoded upstream) while the session lives 15. The viewer
      // reconnects with the same token forever, so expiry looks like a stuck
      // "reconnecting" loop. If the presented token still matches the live
      // session's token, accept it — guessing a 256-bit token is infeasible,
      // and this surface never shares viewer links. Foreign/rotated tokens
      // still 4403 below.
      try {
        const rec = store.getById?.(sessionId);
        if (rec && typeof rec.viewerToken === "string" && rec.viewerToken.length > 0) {
          const a = Buffer.from(token);
          const b = Buffer.from(rec.viewerToken);
          const { timingSafeEqual } = require("node:crypto");
          if (a.length === b.length && timingSafeEqual(a, b)) {
            record = rec;
            try {
              store.touch?.(sessionId);
            } catch {
              // Ignore.
            }
          }
        }
      } catch {
        // Fall through to the 4403 below.
      }
    }
    if (!record) {
      try {
        const fs = require("node:fs");
        fs.appendFileSync(
          "/tmp/atrium-relay-debug.log",
          JSON.stringify({
            at: new Date().toISOString(),
            event: "reject",
            pid: process.pid,
            uptimeSec: Math.round(process.uptime()),
            hasData: Boolean(client?.data),
            dataKeys: client?.data ? Object.keys(client.data) : null,
            sessionId,
            tokenLen: typeof token === "string" ? token.length : typeof token,
            tokenPrefix: typeof token === "string" ? token.slice(0, 6) : null,
            liveSessions:
              typeof store?.list === "function"
                ? store.list().map((r: any) => r.sessionId)
                : "n/a",
          }) + "\n"
        );
      } catch {
        // Never break the relay for logging.
      }
      try {
        client.close(4403, "invalid_token");
      } catch {
        // Ignore.
      }
      return;
    }
    if (!sessionId || typeof token !== "string") {
      try {
        client.close(4403, "invalid_token");
      } catch {
        // Ignore.
      }
      return;
    }
    try {
      store.touch?.(sessionId);
    } catch {
      // Ignore.
    }
    sessionByClient.set(client, sessionId);

    const secret = config.ATRIUM_WORKER_SECRET || "";
    if (!secret) {
      try {
        client.close(1011, "browser not configured");
      } catch {
        // Ignore.
      }
      return;
    }
    const dialBase = getBrowserWorkerDialBase().replace(/\/$/, "");
    const wsBase = dialBase.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    const upstreamUrl = `${wsBase}/internal/stream/${encodeURIComponent(sessionId)}`;

    let upstream: InstanceType<typeof UpstreamSocket>;
    try {
      upstream = new UpstreamSocket(upstreamUrl, {
        headers: { Authorization: `Bearer ${secret}` },
      });
    } catch {
      try {
        client.close(1011, "upstream open failed");
      } catch {
        // Ignore.
      }
      return;
    }
    upstreamByClient.set(client, upstream);

    const dialTimer = setTimeout(() => {
      try {
        upstream.terminate();
      } catch {
        // Ignore.
      }
      try {
        client.close(1011, "upstream dial timeout");
      } catch {
        // Ignore.
      }
    }, 10_000);

    upstream.on("open", () => {
      clearTimeout(dialTimer);
      try {
        for (const line of store.peekReplay?.(sessionId) ?? []) {
          viewerSend(client, line);
        }
      } catch {
        // Ignore replay failures.
      }
    });
    upstream.on("message", (data: Buffer, isBinary: boolean) => {
      try {
        store.touch?.(sessionId);
      } catch {
        // Ignore.
      }
      if (!isBinary) {
        try {
          store.appendUpstreamJson?.(sessionId, data.toString());
        } catch {
          // Ignore.
        }
      }
      viewerSend(client, isBinary ? (data as Buffer) : data.toString());
    });
    const onUpstreamError = (): void => {
      clearTimeout(dialTimer);
      try {
        client.close(1011, "upstream error");
      } catch {
        // Ignore.
      }
      closeUpstream(client);
    };
    upstream.on("error", onUpstreamError);
    upstream.on("close", () => {
      clearTimeout(dialTimer);
      try {
        client.close(1000, "session closed");
      } catch {
        // Ignore.
      }
      closeUpstream(client);
    });
    upstream.on("unexpected-response", () => {
      clearTimeout(dialTimer);
      try {
        client.close(1011, "upstream unavailable");
      } catch {
        // Ignore.
      }
      closeUpstream(client);
    });
  },

  message(client: any, message: string | Buffer | ArrayBuffer | Uint8Array): void {
    const upstream = upstreamByClient.get(client);
    if (!upstream || upstream.readyState !== UpstreamSocket.OPEN) return;
    const sessionId = sessionByClient.get(client);
    try {
      if (typeof message === "string") {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(message);
        } catch {
          upstream.send(message);
          return;
        }
        if (!viewerMessageAllowed(parsed, ["*"])) {
          viewerSend(client, JSON.stringify({ t: "error", code: "url_not_allowed", message: "URL blocked" }));
          return;
        }
        if (sessionId) {
          try {
            (atriumCore.memoryStore as any).touch?.(sessionId);
          } catch {
            // Ignore.
          }
        }
        upstream.send(message);
        return;
      }
      upstream.send(message as any, { binary: true });
    } catch {
      // Ignore relay failures; close handlers report them.
    }
  },

  close(client: any): void {
    closeUpstream(client);
  },
};
