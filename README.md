# PolyDocks — the Agentic Dock

> **One agent and its dock.** Everything you see is a plugin opened in it — a real browser, notes, sources, quests, files, terminals, and the tools the agent builds for you on the spot. The agent is the operator: it opens, closes, orders, operates, and modifies; it never duplicates what already exists.

[![Meta Model API](https://img.shields.io/badge/Meta_Model_API-muse--spark--1.3-blue?style=flat-square)](https://dev.meta.ai/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

Chatbots answer and disappear. PolyDocks gives you an agent that **builds the environment you think in** — it researches the web, mounts a real browser, synthesizes tools into your dock, runs code in isolated sandboxes, and narrates its work as a living thought stream instead of a chat log.

---

## Watch it work (60 seconds)

1. Open the app, hit the orb, ask: **"Research transformers and open the best paper"**
2. Thoughts drift up from the orb — *Searching the web… Reading primary sources…* — with the source's brand mark inline
3. The agent opens the paper **in a real Chromium tab inside the dock** — no proxy, no reader-mode mangling
4. Ask **"build flashcards for this"** → a native flashcards tool mounts in the dock, themed like the rest of the app

No mocks, no storyboard. That is the product.

---

## What the agent can do

| Capability | How it feels | Under the hood |
|---|---|---|
| **Native browser** | Real Chromium tabs in the dock: URL bar, back/forward, lateral tabs, blank-start, edge-to-edge canvas. Frame-blockers open fine. | Atrium remote-browser worker + Bun-native WS relay (`server/browser/`). Per-workspace sessions, short-lived viewer tokens, worker secret never leaves the server. [docs/browser.md](docs/browser.md) |
| **Thought stream** | Short status lines rise from the orb and fade — never a chat log. Finals land as cards, never in the stream. | Provider-agnostic event contract (`say`/`thought`/`job.*`), pure capped queue, CSS-only animation, reduced-motion aware. |
| **Research engine** | "Compare these two papers" → TinyFish web/news/papers search + full-text fetch, saved as workspace sources with brand marks. | Server-side TinyFish adapter (`server/discovery/tinyfish.ts`); keys never reach the front. |
| **Voice** | Tap the orb and talk: live transcription streams back, hands-free dock operation. | Meta realtime proxy over `wss /api/voice/realtime`; API key stays server-side. |
| **Code execution** | The agent runs shell, files and dev servers in isolated per-workspace sandboxes; previews come back as tunnel URLs. | Modal sandboxes (`node:22-slim`, per-workspace volume). `MODAL_TOKEN_*` in `.env`. [docs/sandbox.md](docs/sandbox.md) |
| **Generative media** | Covers, share cards and city art generated on request, cached, daily-budget guarded. | Muse Image (`muse-image-1.0`) + `image_spend` ledger. |
| **Plugin OS** | The agent **creates, installs, operates, rolls back** tools — and its output is gated: no opaque boxes, no hardcoded colors, theme tokens only, or the build is refused with the rule name. | Single-file plugins + manifest, sandboxed iframes, capability bus with risk policy, slop validator (`server/plugins/slop.ts`). |
| **Dock verbs** | `dock.open/close/pin/unpin/list/focus/next/prev/background` — the agent curates the bar instead of duplicating tools. | One action layer shared by UI, REST, CLI and agent (`src/lib/dock/dockModel.ts`). |

### Example prompts

- **"Build flashcards for Stoicism"** → interactive flashcards tool, mounted and themed.
- **"Open youtube.com and find a UI design talk"** → real browser tab, navigated by the agent.
- **"Turn this topic into learning quests"** → structured quests with XP progression.
- **"Change my background / apply a cyber theme"** → theme applies everywhere, including agent-built plugins.

---

## Architecture (microkernel, for real)

```
┌─────────────────────────────────────────────────┐
│  Agentic Dock (pinned control surface)          │
│  browser · notes · sources · quests · files ·   │
│  terminal · agent-built tools (sandboxed)       │
├─────────────────────────────────────────────────┤
│  Privileged services (first-party, host-owned)  │
│  agent loop · browser relay · voice proxy ·     │
│  reader · TinyFish · sandbox bridge             │
├─────────────────────────────────────────────────┤
│  Core (never a plugin)                          │
│  runtime+routes · permission/approval engine ·  │
│  persistence (SQLite) · secrets/keys            │
└─────────────────────────────────────────────────┘
```

What stays core: runtime and routes, the agent loop, the permission and approval engine, persistence, the sandbox bridge, secrets and keys. **Everything else is a plugin** — a single file with a manifest, running sandboxed (`<iframe sandbox="allow-scripts" srcdoc>`), talking to the app only through the `window.polymax` bridge. The core never understands domain concepts: plugins own state, the core passes an opaque `contextId`.

Full picture with code evidence: [`VISION.md`](VISION.md), [`ARCHITECTURE.md`](ARCHITECTURE.md) (Today / Target / Gaps), [`MIGRATION.md`](MIGRATION.md).

---

## Stack

Vite + React + TypeScript, Tailwind v4, shadcn/ui, zustand · Bun + Hono + SQLite (`bun:sqlite`), one process serves API + built front · Docker single image.

One model per job (`server/agent/modelRegistry.ts`, env only, no hardcoded ids): agent `muse-spark-1.3` (selector offers `muse-wonder-1.0` for hard tasks), voice `muse-voice-transcribe-1.0`, image `muse-image-1.0`, open-weight toggle via `AGENT_PROVIDER=openweight`. Model failures return structured `{ ok: false, error: { code, message, retryable } }` — never a fake success. Details: [docs/meta-model-api.md](docs/meta-model-api.md).

---

## Current status (honest)

- **Runs today:** single-user local runtime. `bun run dev` (+ `npx atrium-worker` for the browser) or `docker compose up`. You bring `MODEL_API_KEY` (+ `TINYFISH_API_KEY`, `MODAL_*` for the full show); without a model key the agent answers `model_unauthorized`.
- **Not built yet:** per-user sandboxes, auth/multi-tenancy, remote plugin store. Until those ship, do not expose the server beyond localhost.
- **In migration:** city/world views are still hardcoded core imports; they become plugins under issue #153 (see `MIGRATION.md`).

---

## Quickstart

Prerequisites: [Bun](https://bun.sh) (v1.1+)

```bash
git clone https://github.com/0Pxyz/polymax.git
cd polymax
cp .env.example .env # Add MODEL_API_KEY (+ TINYFISH_API_KEY for research)
bun install
bun run dev          # app on http://localhost:5173 (API :3000)
# Browser surface needs real Chromium next to it:
ATRIUM_WORKER_SECRET=dev-secret-change-me npx atrium-worker
```

For Docker instructions and contributor rules, see [AGENTS.md](AGENTS.md).

---

Built for the **Meta Global AI Developer Hackathon** (Indie Track). Distributed under the [MIT License](LICENSE).
