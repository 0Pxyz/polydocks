# Polymax

> **The Agentic Dock for Polymaths**  
> An autonomous knowledge workspace powered by Meta AI that turns learning into an interactive world map where agents build tabs, organize research, and synthesize custom tools on the fly.

[![Meta Model API](https://img.shields.io/badge/Meta_Model_API-muse--spark--1.3-blue?style=flat-square)](https://dev.meta.ai/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Runtime](https://img.shields.io/badge/Runtime-Bun_%7C_Docker-2496ed?style=flat-square)](docker-compose.yml)

![Polymax: Agentic Dock and Knowledge World](docs/assets/polymax-hero.png)
<!-- Screenshot to capture: Interactive procedural world map with knowledge regions and cities, with the top Nook tray expanded displaying Level, XP, and active dock icons. -->

---

## Not a chatbot

Learning is scattered across dozens of disconnected tabs, docs, videos, and terminal windows. Chatbots only regurgitate text into an ephemeral conversation feed.

Polymax gives you an agent that doesn't just answer: it builds and shapes the active environment you learn in.

---

## How it works

1. **Explore:** Declare what you want to master to generate a procedural world map where disciplines become regions and concepts become explorable cities.
2. **Delegate:** The agent scours authoritative primary sources, ingests academic papers, and prepares structured city workspaces.
3. **Learn & Build:** The agent mounts interactive tabs, flashcards, comparators, and tools directly into your dock as you master concepts.

```
Explore (World Map) ──► Delegate (Meta AI Agent) ──► Learn & Build (Agentic Dock)
```

---

## The Agentic Dock

The Dock is the primary control surface of Polymax. There is no infinite canvas sprawl, no floating window clutter, and no chat bubbles. Pinned to the top of the viewport, the Nook dock expands on demand, making the active tab become the workspace backdrop.

Instead of being confined to fixed views, the dock is completely dynamic. The agent writes declarative manifests and self-contained code at runtime, mounting custom micro-tools inside sandboxed iframes connected through a secure message bridge.

![The Polymax Agentic Dock](docs/assets/polymax-dock.png)
<!-- Screenshot to capture: The Nook dock expanded over an active city workspace, showing built-in tabs alongside an agent-synthesized micro-app. -->

### Supported Workflows
- **"Synthesize a flashcards tab for Stoicism"** → Agent writes an interactive quiz app and mounts it as an active dock tab.
- **"Compare these two research papers"** → Agent fetches sources via TinyFish and builds a side-by-side comparison tab.
- **"Organize learning quests for Quantum Computing"** → Agent structures milestones and links them to progression XP.
- **"Spawn an isolated terminal for this city"** *(Planned)* → PTY terminal tab running commands against granted workspace directories.

---

## Why Meta AI

Polymax runs on Meta's **`muse-spark-1.3`** via the Meta Model API.

The model acts as the runtime brain: it drives intent parsing, orchestrates autonomous web discovery via TinyFish (`search_web`, `fetch_page`), and invokes typed tool-calls (`create_tab`, `open_tab`, `update_tab`, `read_city_file`). Rather than feeding passive answers, it uses Socratic questioning to guide users toward primary sources. The system supports open-weight model endpoints via standard `MODEL_BASE_URL` configuration.

---

## Demo

![Polymax 60-Second Walkthrough](docs/assets/polymax-demo.gif)
<!-- Screenshot to capture: 60-second walkthrough showing map generation, entering a city workspace, commanding the agent to build a custom flashcard tab, and dock interaction. -->

---

## Quickstart

**Prerequisites:** [Docker](https://www.docker.com/) or [Bun](https://bun.sh) (v1.1+)

```bash
git clone https://github.com/0Pxyz/polymax.git && cd polymax
cp .env.example .env # Add your MODEL_API_KEY
docker compose up    # Or locally: bun install && bun run dev
```

Open [http://localhost:3000](http://localhost:3000). For local machine permissions and grant models, see [AGENTS.md](AGENTS.md).

---

Built for the **Meta Global AI Developer Hackathon** (Indie Track). Distributed under the [MIT License](LICENSE).  
For architecture, tool schemas, and contribution rules, read [**AGENTS.md**](AGENTS.md).
