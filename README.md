# Polymax

> **The Agentic Dock for Polymaths**  
> An autonomous knowledge game and workspace powered by Meta AI that turns learning into an interactive world map where agents build tools, organize research, and shape custom environments on demand.

[![Meta Model API](https://img.shields.io/badge/Meta_Model_API-muse--spark--1.3-blue?style=flat-square)](https://dev.meta.ai/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

![Polymax: Agentic Dock and Knowledge World](docs/assets/polymax-hero.png)
<!-- Screenshot to capture: Interactive world map with knowledge regions and cities, with the Agentic Dock pinned at the top displaying Level, XP, and active tool icons. -->

---

## Not a chatbot

Learning is scattered across browser tabs, documentation, videos, and local files. Chatbots respond with isolated walls of text inside a transient chat stream.

Polymax gives you an agent that builds the environment you learn in. Instead of answering and disappearing, it structures your workspace, surfaces primary sources, and mounts dedicated tools for your goals.

---

## How it works

- **Explore:** Choose any discipline to generate an interactive world map where subjects become explorable cities.
- **Delegate:** Task the agent with researching topics, fetching papers, and organizing workspace files.
- **Learn & Build:** The agent builds custom tools, flashcards, and quests directly into your dock as you advance.

---

## The Agentic Dock

The Dock is the central interface of Polymax. There is no infinite canvas to manage, no floating window sprawl, and no chat-bubble feed. Pinned to the top of the screen, the dock holds active tools and expands them directly into your workspace.

The agent actively controls the dock. It is not limited to a static set of interfaces. When a topic requires a custom comparison, an interactive practice session, or live research, the agent synthesizes that tool on the fly and mounts it into your dock.

![The Polymax Agentic Dock](docs/assets/polymax-dock.png)
<!-- Screenshot to capture: The Agentic Dock expanded over an active city workspace, displaying research tools alongside an agent-generated interactive flashcards tool. -->

### What you can ask the agent
- **"Build flashcards for Stoicism"** → The agent generates an interactive flashcard practice tool and mounts it in the dock.
- **"Compare these two research papers"** → The agent fetches the papers via TinyFish and builds a side-by-side analysis tool.
- **"Turn this topic into learning quests"** → The agent parses key concepts into structured quests with XP progression.
- **"Run code against this city's files"** *(planned)* → The agent opens an interactive terminal workspace for execution.

---

## Powered by Meta AI

Polymax runs on Meta's `muse-spark-1.3` through the Meta Model API.

The model serves as the core agent runtime. It parses user intent, determines when to query primary sources, and executes typed tool calls to create and update tools in the dock. It uses Socratic interaction to challenge understanding rather than supplying pre-packaged answers. The system also supports self-hosted open-weight endpoints by setting `MODEL_BASE_URL` in `.env`.

---

## Demo

![Polymax 60-Second Walkthrough](docs/assets/polymax-demo.gif)
<!-- Walkthrough video placeholder: 60-second video demonstrating world map navigation, opening a city workspace, asking the agent to create a custom tool, and interacting with the dock. -->

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

Open [http://localhost:3000](http://localhost:3000). For Docker instructions and environment options, see [AGENTS.md](AGENTS.md).

---

Built for the **Meta Global AI Developer Hackathon** (Indie Track). Distributed under the [MIT License](LICENSE).  
Architecture guidelines and contributor rules are documented in [**AGENTS.md**](AGENTS.md). Core product philosophy is documented in [**docs/product-philosophy.md**](docs/product-philosophy.md).
