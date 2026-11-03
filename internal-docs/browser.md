# Native Browser (Atrium): proposal and runbook

## Decision

**Atrium** (`@atriumjs/core` + `@atriumjs/react` + `@atriumjs/worker`) is the
remote-browser layer. It is the only evaluated option that gives us a real
Chromium session with an existing React viewer, without building rendering,
proxy, or CSP-bypass infrastructure ourselves.

| Option | Verdict |
|---|---|
| Atrium | Open-source, self-hosted, `RemoteBrowser` canvas viewer with optional chrome, multi-tab via worker `tabs` messages, session snapshots (cookies + `storageState`), short-lived viewer tokens, worker secret stays server-side. Fits single-process dev and a sidecar worker in prod. |
| Browserless Live Browser | Mature hosted viewer (iframe Live URL), but adds a paid external dependency and ships its own Chrome UI; less control over tokens and per-workspace isolation. |
| Cloudflare Browser Run / Live View | Edge-hosted Chromium with Live View, but locks deployment to Cloudflare and moves sessions/tokens off our backend. Against the zero-setup local runtime goal. |

No custom HTML proxy, no rendering engine, no extensions/DevTools, no new
plugin architecture. The viewer is reused as-is; our chrome is a
PolyDocks-token toolbar (URL, back/forward/reload, worker tab strip).

## Why this shape (first-party plugin, host-rendered surface)

The browser **is** a first-party plugin: `browserPluginManifest` + the
`browser.open` capability on the bus, same as Notes/Sources. Those are also
host-rendered, not `srcdoc` iframes — the iframe sandbox is for untrusted
agent-generated code. Moving our own viewer into `srcdoc` would force a new
token-vending bridge (bigger attack surface) and degrade
clipboard/fullscreen, for zero gain: the dangerous part (Chromium,
downloads) runs on the worker either way.

Downloads land on **worker disk**, never on the user's machine. Containment
is sessions-per-tenant (5), 15min/5min TTLs, per-session contexts, no
cookie/token exposure to guests. Upstream gap: the worker has no
download-disable switch — run prod workers on ephemeral disk.

## UI contract

- Full-width surface (`dvh`-aware heights). The remote viewport is bootstrapped
  to the measured stage aspect (phone 390×844 on narrow screens), so the
  canvas fills edge-to-edge with no letterbox bars and no floating-box frame
  (vendored canvas border/radius/backdrop stripped by CSS).
- Lateral tab rail (icons on mobile, labels on desktop): one worker session
  per tab, capped at 5 (worker tenant cap). New tabs start blank
  (`about:blank`); × on a tab destroys its session server-side, closing the
  last tab opens a fresh blank one. No separate Chrome UI.
- All pages and videos open in the remote Chromium (single surface).
  Remote playback for now — audio is the open goal, see below.
- No viewer chatter: connection state is one dot; the vendored presence
  pill is hidden by CSS (degrades to visible on upstream markup change).
- Explicit × closes the session server-side and starts fresh; otherwise the
  session persists across UI navigation until TTL/idle eviction.

## Rule: everything browser goes through the native surface

Every page, video, or research result opens in the Browser surface
(`open_source` / `browser.open`). Videos take its native fast path (local
playback). Never ad-hoc iframes or raw browser windows for content. Enforced
in `AGENTS.md` (§4b) and the research skill prompt.

## Architecture (first-party privileged service)

- **Backend** (`server/browser/`): `atriumHost.ts` creates one `@atriumjs/core`
  host (tenant = workspace header or user id, 15min session TTL, 5min idle,
  max 5 sessions/tenant). `route.ts` passes HTTP straight to
  `core.handleRequest`. `relay.ts` is a Bun-native viewer WebSocket relay
  (viewerToken auth with grace for our own expired tokens, replay, upstream
  dial to the worker, navigate allowlist).
- **Frontend** (`src/features/browser/`): `NativeBrowserView` renders
  `RemoteBrowser` (interactive, tab strip only) inside the dock `browser`
  surface. Session persists in `useTabState` and survives UI
  navigation via `TabHost` (mounted-hidden, hibernation restores from storage).
- **Agent**: no new tools. `open_source` / `browser.open` opens everything
  in the Browser surface (pages and videos alike). Background research reuses
  the existing sessions/tasks engine (`list_tasks`, `type: "research"`).
- **Security**: per-workspace tenants, short-lived viewer tokens, worker
  secret server-only, user plugins stay in sandboxed iframes with no token
  access.

## Run

Dev (two processes):

```sh
npx playwright install chromium   # once per machine
ATRIUM_WORKER_SECRET=dev-secret-change-me ATRIUM_WORKER_HEADLESS=1 ATRIUM_STEALTH=0 node --unhandled-rejections=warn node_modules/@atriumjs/worker/dist/run.js
bun run dev
```

Flags: `HEADLESS=1` keeps Chromium off your screen (headed pops a window
per session); `STEALTH=0` skips the fingerprint-evasion plugins (≈5x faster
cold start, ~0.4s vs ~2.2s measured — re-enable only if a site blocks you
as a bot); `node --unhandled-rejections=warn` keeps one failed navigation
from killing the worker and all its sessions. Set the same secret in `.env`
(`ATRIUM_WORKER_SECRET`). Without it the surface degrades to the Reader and
`/api/browser/*` returns `browser_unavailable`. Prod: run the Atrium worker
as a sidecar on the internal network with `ATRIUM_WORKER_DIAL_BASE`
pointing at it; no app changes needed.

## Performance profile (measured, local loopback)

- Session create + bootstrap: ~30ms (no Chromium yet — lazy).
- Cold start (Chromium launch + first paint): ~2.2s with stealth,
  **~0.4s with `STEALTH=0`**.
- Navigate → first new frame: **~100ms**; static pages then go idle
  (screencast only sends on paint — efficient, not stalled).
- Heavy/animated pages render on CPU (SwiftShader, no GPU in headless
  workers) — that, not the relay, is the remaining ceiling. Video-heavy
  pages will always feel remote; that is the Atrium 0.3.0 design envelope
  (10–15 fps target), not a tunable.

## Verified (dev, 2026-10-31)

End-to-end against a live worker: `POST /sessions` with `initialUrl`
(Chromium bootstrap), `GET /sessions/:id`, viewer WebSocket upgrade with
`viewerToken` auth, `hello` + `tabs` + JPEG `frame` relay through the
Bun-native relay (`server/browser/relay.ts`). Wrong tokens still get 4403.

## Known upstream warts (Atrium 0.3.0)

- **Audio: explicit goal, no cheap path.** The worker launches Chromium with
  `--mute-audio` and the screencast carries video frames only — flipping the
  flag alone would render into a void (no capture pipeline to the viewer).
  Audible remote audio needs a new transport (page audio capture + a streamed
  track alongside the JPEG frames), i.e. upstream work or a scoped follow-up
  that forks the worker pipeline. Until then, video plays silent in the
  remote view; the rule stays all-through-Atrium by decision.

- Viewer tokens expire after 5 minutes (hardcoded) while sessions live 15,
  and the viewer retries with the same token forever — expiry looked like a
  stuck "Reconnecting…" loop. Our relay accepts the session's own token past
  expiry (constant-time compare, unguessable 256-bit, links never shared).
  Foreign tokens still get 4403.
- The worker materializes the Chromium session on the **first viewer
  connection**, not on bootstrap. A server-side `navigate` before any viewer
  connects returns `session_not_active` (surfaced as HTTP 502) by design.
  The surface navigates through the viewer channel until `live` and
  auto-recovers (re-ensure + retry) when the worker restarts.
- The worker process dies on some failed navigations (uncaught
  `page.goto: net::ERR_ABORTED` in `handleInternalHttp`). In dev, run it
  with `node --unhandled-rejections=warn` plus a restart loop so one bad
  navigation does not take the surface (and all sessions) down.
