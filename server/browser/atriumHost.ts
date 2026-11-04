/**
 * Atrium host: single-process Hono adapter over @atriumjs/core.
 *
 * The core package is framework-agnostic (WebStandard Request/Response for
 * HTTP + an in-memory session store). We mount its HTTP surface directly and
 * implement the viewer WebSocket relay with Bun-native sockets (see relay.ts),
 * mirroring @atriumjs/core streaming.ts semantics: viewerToken auth, replay
 * of recent JSON control messages, bidirectional relay to the worker dial URL,
 * and URL-allowlist enforcement on viewer-driven navigate.
 *
 * Security: the worker shared secret never leaves the server. Viewers only
 * ever see a short-lived per-session viewerToken (capability URL). Tenancy is
 * workspace-scoped: tenantId = workspace header || user id || "local".
 */

import { createAtrium, urlAllowed } from "@atriumjs/core";
import { config } from "../config";
import { sanitizeUserId } from "../identity";

export const BROWSER_MOUNT_PATH = "/api/browser/atrium";

function tenantFromHeaders(headers: Headers): { tenantId: string; userId: string } {
  const userId = sanitizeUserId(headers.get("x-polydocks-user"));
  const workspaceRaw = headers.get("x-polydocks-workspace");
  const workspace =
    typeof workspaceRaw === "string" && /^[a-zA-Z0-9:_-]{1,128}$/.test(workspaceRaw.trim())
      ? workspaceRaw.trim()
      : "";
  const tenantId = workspace || userId || "local";
  return { tenantId, userId: userId || "local" };
}

export function browserWorkerConfigured(): boolean {
  return (config.ATRIUM_WORKER_SECRET || "").trim().length > 0;
}

export function getBrowserWorkerDialBase(): string {
  const raw = (config.ATRIUM_WORKER_DIAL_BASE || "ws://127.0.0.1:7070").trim();
  return raw.replace(/\/$/, "");
}

export const atriumCore = createAtrium({
  authorize: async (input) => tenantFromHeaders(input.headers),
  policies: {
    sessionTtlMs: 15 * 60_000,
    idleTtlMs: 5 * 60_000,
    maxConcurrentSessionsPerTenant: 5,
    urlAllowlist: ["*"],
    defaultViewport: { w: 1280, h: 800 },
  },
  worker: {
    dialBase: getBrowserWorkerDialBase(),
    sharedSecret: config.ATRIUM_WORKER_SECRET || "",
  },
  mountPath: BROWSER_MOUNT_PATH,
  transports: ["ws"],
});

export { urlAllowed };
