# Polymax: The Agentic Dock

> **An Autonomous Knowledge Game & Workspace Powered by Meta AI**  
> *Meta Global AI Developer Hackathon (Indie Developer Track)*

[![CI Status](https://img.shields.io/badge/CI-passing-22c55e?style=flat-square)](https://github.com/0Pxyz/polymax)
[![Meta Model API](https://img.shields.io/badge/Meta_Model_API-muse--spark--1.3-blue?style=flat-square)](https://dev.meta.ai/docs)
[![Docker](https://img.shields.io/badge/Docker-compose_ready-2496ed?style=flat-square)](docker-compose.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## What is Polymax?

Polymax turns learning and research into an exploratory, agentic experience. You declare what you want to master, and an autonomous agent constructs an interactive **world map** where broad knowledge domains form expansive regions and specific concepts become explorable **cities**.

Entering a city opens its active workspace—containing authentic sources, research papers, notes, local files, and live micro-apps gathered around that topic.

### The Agentic Dock Philosophy

Instead of an endless chat-bubble feed or a chaotic infinite canvas, Polymax is centered around a single control surface: **The Nook**.

```
                      ┌──────────────────────────────────────┐
                      │   LVL 04   [====     ] 450 XP   🔥 5    │  <-- Status Line
                      ├──────────────────────────────────────┤
                      │  [🌐]  [📁]  [📝]  [📜]  [⚡]  [🤖]  [+] │  <-- Expandable Dock
                      └──────────────────────────────────────┘
                                         ▲
                                 THE NOOK TRAY
```

- **The Dock IS the Product:** Pinned to the top of every screen, the dock holds icons for each active **tab**. Clicking an icon expands the tray so that the tab's screen *becomes* the backdrop—clean, focused, and free of distracting modals.
- **Dynamic Agent Tabs:** The Nook Agent (powered by Meta's `muse-spark-1.3`) actively controls the dock and **creates new tabs on request** ("*create a flashcards tab for Stoicism*", "*build a comparator tab for these two papers*").
- **A Tab is a Workspace Component:** Tabs can be built-in modules (`Browser`, `Files`, `Notes`, `Papers`, `Terminal`, `Quests`) or self-contained HTML/JS micro-apps synthesized at runtime and executed inside sandboxed iframes with a safe `postMessage` bridge.
- **Socratic Guidance:** The agent asks targeted questions and opens primary sources—it challenges the user to learn and practice rather than vomiting pre-cooked answers.

---

## Key Features

- **Procedural World Map:** Interests become regions and topics become cities, generated deterministically from seed or synthesized on demand.
- **Pluggable & Agentic Tabs:** Native tabs alongside agent-synthesized micro-apps running safely inside sandboxed frames with isolated storage.
- **Autonomous Discovery via TinyFish:** The agent scours the live web for authoritative documentation, news, and research papers, converting them into actionable learning quests.
- **Dual Runtime Support:** Standard containerized deployment via Docker or direct local execution with Bun for native system & file interaction.
- **Design System First:** Dark-only aesthetic, built with custom tokens, responsive motion transitions, and clean typography.

---

## Quickstart & Installation

You can run Polymax either as a containerized web app or locally on your machine with Bun.

### Option 1: Run with Docker (Zero Setup / Standard App)

The fastest way to experience Polymax with zero local tool dependencies:

```bash
# 1. Clone the repository
git clone https://github.com/0Pxyz/polymax.git
cd polymax

# 2. Configure environment variables
cp .env.example .env
# Open .env and add your MODEL_API_KEY (and optional TINYFISH_API_KEY)

# 3. Launch the unified container
docker compose up
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Option 2: Run Locally with Bun (Local Machine & Dev Mode)

For local development or when using native workspace access:

#### Prerequisites
- [Bun](https://bun.sh) (v1.1 or higher)

```bash
# 1. Clone the repository
git clone https://github.com/0Pxyz/polymax.git
cd polymax

# 2. Install dependencies
bun install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your MODEL_API_KEY and TINYFISH_API_KEY

# 4. Seed the demo world (3 regions, 2 cities each)
bun run seed

# 5. Start the development server (serves frontend + backend concurrently)
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## How to Add a New Tab

Adding a built-in feature to Polymax is frictionless. Simply create a file in `src/features/tabs/<your-tab>/index.tsx` and register it:

```tsx
import { registerTab } from "@/features/tray/registry";
import { BookOpen } from "lucide-react";

export function MyCustomTab() {
  return (
    <div className="p-6 text-foreground">
      <h2 className="text-xl font-display text-accent">My Custom Tab</h2>
      <p className="text-sm text-muted-foreground mt-2">
        Connected to the active city workspace.
      </p>
    </div>
  );
}

// Self-registering tab: no changes required in Tray, Dock, or Router!
registerTab({
  id: "my-custom-tab",
  title: "Custom Tab",
  icon: BookOpen,
  scope: "city",
  component: MyCustomTab,
});
```

Tabs synthesized dynamically by the agent are packaged as isolated HTML/CSS/JS applications rendered inside `<iframe sandbox="allow-scripts" srcdoc="...">` and interact with the host app exclusively through the safe `postMessage` bridge (`polymax.storage`, `polymax.openUrl`, `polymax.getContext`).

---

## Architecture

```
src/
  app/            # Providers, root layout, World | City switch
  features/
    tray/         # Nook tray, expandable dock, status line, tab registry
    world/        # Procedural map rendering and smooth camera controls
    city/         # Active city workspace
    tabs/         # Built-in pluggable tabs (browser, files, notes, papers, terminal)
    profile/      # Progression metrics (Level, XP, Streak)
  lib/
    platform/     # Platform abstraction barrier (window.open, storage, env)
    mapgen/       # Deterministic procedural map generator (generateMap)
    store/        # Zustand state stores
server/
  index.ts        # Fast Hono backend server (serves API & static frontend)
  agent/
    loop.ts       # Meta Model API tool-calling loop (SSE streaming)
    llm.ts        # OpenAI SDK client configured for Meta endpoints
    tools/        # Modular Zod-validated tools (auto-loaded)
    skills/       # Injected prompt skills (create-tab.md)
  discovery/      # TinyFish Search and Fetch integration
  system/         # OS and filesystem access behind typed grants
  workspace/      # Sandboxed filesystem & SQLite access (anti-path traversal)
```

---

## Model & Infrastructure Integration

Polymax adheres strictly to the **Meta Global AI Developer Hackathon** guidelines:
- **Primary Orchestrator:** Meta's `muse-spark-1.3` via the Meta Model API ([dev.meta.ai/docs](https://dev.meta.ai/docs)).
- **Open-Weight Track ($10,000 Award Target):** Swappable without code modifications to open-weight `muse-spark-open-1026` hosted on Baseten or Modal via standard environment variables:
  ```bash
  MODEL_BASE_URL="https://api.meta.ai/v1"
  MODEL_ID="muse-spark-1.3"
  MODEL_API_KEY="your-meta-api-key"
  TINYFISH_API_KEY="your-tinyfish-api-key"
  MAX_STEPS=8
  ```
- **Live Web Discovery:** Leverages TinyFish Search & Fetch APIs (`docs.tinyfish.ai`) to ground topics with real-time academic papers and web articles.

---

## Hackathon Compliance

This project was built from scratch during the Meta Global AI Developer Hackathon (October 27 – November 4, 2026). All product logic, agent architecture, and dock systems adhere to standard Meta Model API requirements and strict security sandbox boundaries.

---

## Documentation

- [**`AGENTS.md`**](AGENTS.md) — Canonical rules for agents and contributors working in this repository.
- [**`CLAUDE.md`**](CLAUDE.md) — Fast reference guide and single-point pointer.
- [**`docs/product.md`**](docs/product.md) — Product vision, pedagogy, and design mechanics.
- [**`docs/architecture.md`**](docs/architecture.md) — Detailed architecture and ADR log.
- [**`docs/design-system.md`**](docs/design-system.md) — Color tokens, typography, and Nook motion rules.
- [**`docs/meta-model-api.md`**](docs/meta-model-api.md) — Meta Model API integration specs.
- [**`docs/tinyfish.md`**](docs/tinyfish.md) — Web search and content ingestion specifications.
- [**`docs/system-access.md`**](docs/system-access.md) — Machine and OS access, capability ladder, security model, and reference notes.

---

## License

Distributed under the [MIT License](LICENSE).
