# PolyDocks

> **One agent and its dock.** Everything you see is a plugin opened in it — browser, notes, sources, quests, files, terminal, and the tools the agent builds for you. The agent is the operator: it opens, closes, orders, operates, and modifies; it never duplicates what already exists.

PolyDocks is a microkernel workspace: the core stays minimal (dock + capability bus + plugin lifecycle/policy + sandbox bridge) and every capability is a plugin — including, as target, the agent itself as a privileged first-party plugin. Full picture: [`VISION.md`](VISION.md), [`ARCHITECTURE.md`](ARCHITECTURE.md) (Today / Target / Gaps, with code evidence), [`MIGRATION.md`](MIGRATION.md).

[![Meta Model API](https://img.shields.io/badge/Meta_Model_API-muse--spark--1.3-blue?style=flat-square)](https://dev.meta.ai/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## Not a chatbot

Learning is scattered across browser tabs, documentation, videos, and local files. Chatbots respond with isolated walls of text inside a transient chat stream.

PolyDocks gives you an agent that builds the environment you learn in. Instead of answering and disappearing, it structures your workspace, surfaces primary sources, and mounts dedicated tools for your goals.

---

## How it works

- **Explore:** Choose any discipline to generate an interactive world map where subjects become explorable contexts.
- **Delegate:** Task the agent with researching topics, fetching papers, and organizing workspace files.
- **Learn & Build:** The agent builds custom tools, flashcards, and quests directly into your dock as you advance.

---

## The dock

The Dock is the central interface. No infinite canvas, no floating window sprawl, no chat-bubble feed. Pinned to the top of the screen, the dock holds active plugin surfaces and expands them into your workspace.

The agent actively controls the dock. When a topic requires a custom comparison, an interactive practice session, or live research, the agent synthesizes that tool on the fly and mounts it into your dock — sandboxed, bridge-only, no direct DOM access to the host.

### What you can ask the agent

- **"Build flashcards for Stoicism"** → The agent generates an interactive flashcard tool and mounts it in the dock.
- **"Compare these two research papers"** → The agent fetches the papers via TinyFish and builds a side-by-side analysis tool.
- **"Turn this topic into learning quests"** → The agent parses key concepts into structured quests with XP progression.

### Plugin vs core

What stays core (never a plugin): the runtime and routes, the agent loop, the permission and approval engine, persistence, the sandbox bridge, secrets and keys. Everything else — including every tool the agent builds — is a plugin: a single file with a manifest, running sandboxed, talking to the app only through the bridge.

The store is local for now: publishing shares a plugin to the community registry on your own machine, with version history and one-click install into any workspace. Review, signing, and remote sharing are post-demo work.

---

## Powered by Meta AI

One model per job. Plugins declare a `modelRole`; `server/agent/modelRegistry.ts` resolves the provider from env only.

| Role | Model | Status |
| :--- | :--- | :--- |
| Agent | `muse-spark-1.3` default, `muse-wonder-1.0` via the chat selector | Running — tool loop `server/agent/loop.ts`, SSE `POST /api/agent` |
| Voice input | `muse-voice-transcribe-1.0` | Running — mic orb → `wss /api/voice/realtime` proxy, key stays server-side |
| Image | `muse-image-1.0` | Running — `generate_image` on chat request, verified file cache under `DATA_DIR/image-cache`, saved to the user's artifacts |
| Open-weight agent | configurable via `AGENT_PROVIDER=openweight` + `OPENWEIGHT_*` in `.env` | Toggle — no plugin changes needed |
| Segmentation | Service present (`server/media/segmentation.ts`) | Service present, agent tool not wired yet |

Every model failure returns a structured `{ ok: false, error: { code, message, retryable, role } }` — never a fake success. Details in [docs/meta-model-api.md](docs/meta-model-api.md).

---

## Current status (honest)

- **Runs today:** single-user local runtime. `bun run dev` or `docker compose up`. You bring `MODEL_API_KEY`; without it the agent answers `model_unauthorized`.
- **Not built yet:** per-user sandboxes, auth/multi-tenancy, remote plugin store. Until those ship, do not expose the server beyond localhost.
- **In migration:** city/world views are still hardcoded core imports; they become plugins under issue #153 (see `MIGRATION.md` Slice 2). The `maps` dock entry is an explicit migration shim, not the target.

---

## Quickstart

Prerequisites: [Bun](https://bun.sh) (v1.1+)

```bash
git clone https://github.com/0Pxyz/polymax.git
cd polymax
cp .env.example .env # Add your MODEL_API_KEY
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). For Docker instructions and contributor rules, see [AGENTS.md](AGENTS.md).

---

Built for the **Meta Global AI Developer Hackathon** (Indie Track). Distributed under the [MIT License](LICENSE).
Architecture guidelines and contributor rules are documented in [**AGENTS.md**](AGENTS.md).
