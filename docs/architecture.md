# Polymax Architecture & Agentic Dock Specification

> **Status:** Reference Architecture  
> **Core Tenet:** *The Dock IS the Product. Everything is a Dock Plugin.*  
> **Agent Runtime:** Meta Model API (`muse-spark-1.3` / `muse-wonder-1.0`) + TinyFish Web Discovery + Model Context Protocol (MCP).

---

## 1. System Overview

Polymax is an **Agentic Dock** workspace and knowledge game built for the Meta Global AI Developer Hackathon.
Instead of chat bubbles, canvas sprawl, or floating window chaos, Polymax is built on two core principles:

1. **The Dock is the Control Surface:** Every workspace capability (Browser, Notes, Papers, Files, Terminal, custom micro-apps) is a **Dock Plugin**. Clicking an icon expands the dock so the tool's surface becomes the active workspace view.
2. **Cities are Isolated Filesystem Folders:** A city is not an opaque row in a proprietary cloud database; it is a standard directory on disk (`workspace/<city-id>/`). Everything—notes, fetched papers, dynamic tools, and layouts—is simply a file.

```
+-----------------------------------------------------------------------------------------+
|                                    USER WORKSPACE                                       |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |                              AGENTIC DOCK TRAY                                  |   |
|   |   [Lv 04 | 450 XP | Streak: 5d]               [⌘K Voice / Dictate / Prompt]     |   |
|   |   Dock: [ 🌐 Browser ] [ 📝 Notes ] [ 📜 Papers ] [ 📁 Files ] [ ⚡ Dynamic Tab ]|   |
|   +---------------------------------------------------------------------------------+   |
|                                            |                                            |
|                   SSE / HTTP API           |   Sandboxed PostMessage Bridge             |
|                   (Port 3000)              |   (srcdoc iframe + window.polymax)         |
|                                            v                                            |
|   +---------------------------------------------------------------------------------+   |
|   |                          BUN + HONO BACKEND SERVICE                             |   |
|   |                                                                                 |   |
|   |   +-------------------+  +--------------------+  +--------------------------+   |   |
|   |   |  Meta Model Loop  |  | TinyFish Discovery |  |     MCP Server & API     |   |   |
|   |   | (muse-spark-1.3)  |  | (Search & Fetch)   |  | (llms.txt / /.well-known)|   |   |
|   |   +-------------------+  +--------------------+  +--------------------------+   |   |
|   |             |                      |                          |                 |   |
|   |   +-------------------------------------------------------------------------+   |   |
|   |   |           SQLite Engine (bun:sqlite - Fast Cache & Quota Ledger)        |   |   |
|   |   +-------------------------------------------------------------------------+   |   |
|   +---------------------------------------------------------------------------------+   |
|                                            |                                            |
|                       POSIX Path-Guarded File Operations                                |
|                                            v                                            |
|   +---------------------------------------------------------------------------------+   |
|   |                    ISOLATED CITY DIRECTORY (workspace/<city-id>/)               |   |
|   |                                                                                 |   |
|   |   workspace/quantum-computing/                                                  |   |
|   |   ├── city.json              # City metadata (region, difficulty, level)        |   |
|   |   ├── workspace.json         # Declarative dock state, open sources, quests     |   |
|   |   ├── feed.json              # Curated research feed (papers, videos, news)     |   |
|   |   ├── notes/                 # Markdown notes (*.md)                            |   |
|   |   ├── sources/               # Raw cached TinyFish JSON fetches                 |   |
|   |   └── tabs/                  # Dynamic micro-app tools synthesized by Muse      |   |
|   |       └── flashcards/                                                           |   |
|   |           ├── manifest.json  # Plugin manifest { id, title, icon, scope }       |   |
|   |           └── index.html     # Self-contained executable UI                      |   |
|   +---------------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------------+
```

---

## 2. The Agentic Dock Plugin Architecture

### 2.1. Unified Plugin Contract
Every tool rendered in Polymax is registered as a dock plugin conforming to a single interface:

```typescript
export interface DockPluginManifest {
  id: string;
  title: string;
  icon: string; // Lucide icon name
  kind: "builtin" | "dynamic";
  scope: "city" | "world" | "global";
  version?: string;
  description?: string;
  pinned?: boolean;
}
```

- **Built-in Plugins:** Shipped with the core application (`Browser`, `Notes`, `Papers`, `Files`, `Terminal`).
- **Dynamic Plugins:** Synthesized on-the-fly by the Meta Model Agent (`muse-spark-1.3`) in response to user requests (e.g., "*build a flashcards tool for Stoicism*", "*create a comparator matrix for these two papers*").

### 2.2. The Sandboxed Dynamic Tab Runtime
Dynamic plugins run in an isolated `<iframe sandbox="allow-scripts" srcdoc="...">` communicating with the host application strictly through the `postMessage` bridge:

```typescript
// Exposed inside the sandboxed guest window as window.polymax
interface PolymaxGuestBridge {
  storage: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  getContext: () => Promise<CityContextPayload>;
  openUrl: (url: string) => void;
  submitCommand: (prompt: string) => void;
  ui: {
    expand: () => void;
    notify: (message: string) => void;
  };
}
```

---

## 3. The Meta Muse Agent: Generation & Tab Vision

### 3.1. Meta Model API Integration
Polymax utilizes the Meta Model API with the `muse-spark-1.3` standard model:
- **Base URL:** `https://api.meta.ai/v1`
- **Auth:** Bearer authentication with `MODEL_API_KEY`
- **Zero Hallucination Validation:** Tool calls are validated via strict Zod schemas; invalid payloads return error text to the model with auto-retry (max 2 retries).
- **Execution Loop (`server/agent/loop.ts`):** Parallel tool execution until the model answers without tool calls (no env-imposed step cap; an explicit per-turn `maxSteps` remains available to callers), streamed via Server-Sent Events (SSE).

### 3.2. Native UI Synthesis (`create_tab`)
When instructed, the agent synthesizes complete, self-contained micro-applications adhering to Polymax design tokens (Dark Theme: background `#0A0A0C`, accent `#C8FF57`, typography Inter/Syne/Geist Mono).
The generated artifact is written to `workspace/<city>/tabs/<tab-id>/index.html` alongside a `manifest.json`.

### 3.3. Tab Vision & Cross-Tab Interaction
The Muse agent does not operate blind. It can inspect active tabs, read their open content, and dispatch **Open Intents**:
- `list_tabs`: Inspect all registered dock plugins and their active states.
- `get_tab_state`: Read current scroll, active note, or URL of any open tab.
- `open_intent`: Materialize a tab and prime it with targeted content (e.g., open Browser at an arXiv paper or open Notes at a generated summary).
- `interact_tab`: Send synthetic events or commands into active tabs via the bridge.

---

## 4. TinyFish Web Discovery, Research Skill & City Feeds

When a user discovers or enters a city—or prompts the agent to explore a topic—Polymax initiates autonomous web research powered by TinyFish (following the [TinyFish for Coding Agents Guide](https://docs.tinyfish.ai/for-coding-agents)):

```
[City Entered / Prompt] ──> Muse Agent activates web-research skill
                                       │
                                       v
                               TinyFish Search API (1-3s) ──> Top 5-10 URLs (papers, videos, guides)
                                       │
                                       v
                               TinyFish Batch Fetch (1-20s) ──> Chromium Clean Markdown
                                       │
                                       v
                       Muse Agent parses & curates structured items
                                       │
           ┌───────────────────────────┴───────────────────────────┐
           v                                                       v
  workspace/<city>/feed.json                              workspace/<city>/sources/*.json
           │
           v
  Agentic Dock "Feed Tab"
  - Interactive cards with badges (Paper, Video, Guide)
  - One-click "Open in Browser", "Open in Papers", "Add to Quest"
```

- **Search:** `GET https://api.search.tinyfish.ai` targeting `web`, `news`, or `research_paper` (1–3s latency).
- **Fetch:** `POST https://api.fetch.tinyfish.ai` (up to 10 URLs batched, format: markdown via Chromium render, 1–20s latency).
- **Agent Skill (`web-research.md`):** Muse knows when to search, how to select authoritative primary sources, and how to structure them into learning paths.
- **The Feed Tab Plugin:** A first-class Dock plugin that renders the curated content cards directly into the viewport, allowing users to launch the Browser or study papers with a single click.
- **Untrusted Content Guard:** Web fetched content is treated as untrusted data, capped at 16KB per page, and strictly insulated from system execution.

---

## 5. File-Based Workspace Isolation (POSIX First)

Every city's entire state is transparent, human-readable, and versionable:
- `workspace/<city-id>/city.json`: Meta attributes, unlocked quests, level.
- `workspace/<city-id>/workspace.json`: Active dock tabs, pinned plugins, open sources.
- `workspace/<city-id>/feed.json`: Dynamic learning feed generated by TinyFish + Muse.
- `workspace/<city-id>/notes/*.md`: Notes readable and editable directly in Obsidian or VS Code.
- `workspace/<city-id>/sources/*.json`: Raw fetched documents and paper metadata.
- `workspace/<city-id>/tabs/<tab-id>/`: Custom tools generated by the agent.

**Path-Traversal Guard:** All file accesses in `server/workspace/` resolve paths against `realpath` and verify that the target directory stays strictly within the resolved city workspace root. Any attempt to traverse (`../`) or follow symlinks outside the sandbox is rejected with HTTP 403.

---

## 6. Agentic Day-1: MCP Server & Discovery Standards

To make Polymax an open, agent-native environment from Day 1, the backend exposes:

### 6.1. `/.well-known/llms.txt`
A machine-readable directory explaining Polymax's endpoints, city structure, available tools, and agent instructions:
- `GET /.well-known/llms.txt`: Summary of the Polymax world map, current city workspaces, and API entry points.
- `GET /.well-known/llms-full.txt`: Detailed prompt instructions and schemas for external LLMs.

### 6.2. Model Context Protocol (MCP) Server Endpoint (`/api/mcp`)
External agents (Cursor, Claude Desktop, Antigravity, custom CLI bots) can connect to Polymax via MCP over SSE or HTTP POST:
- **Tools exposed:**
  - `list_cities`: Retrieve all discovered regions and cities on the world map.
  - `get_city_workspace`: Read the notes, tabs, and feed of any city.
  - `create_city_note`: Write a new markdown note directly into a city workspace.
  - `synthesize_dock_plugin`: Request Muse to generate a new dock tab.
  - `run_tinyfish_research`: Trigger real-time web discovery for a topic.
- **Resources exposed:**
  - `workspace://<city>/notes/<file>`
  - `workspace://<city>/feed`
  - `workspace://<city>/tabs`

---

## 7. Short & Robust Backend API Surface

Built on **Bun + Hono**, the API is lightweight, fast (<5ms response time), and strictly typed:

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health, model status, and TinyFish connectivity |
| `POST` | `/api/agent` | Agent tool-calling loop with Server-Sent Events (SSE) streaming |
| `GET` | `/api/cities` | List all discovered regions and cities |
| `GET` | `/api/cities/:id` | Get city manifest and workspace context |
| `GET` | `/api/cities/:id/feed` | Get curated TinyFish research feed |
| `POST` | `/api/cities/:id/feed/refresh` | Trigger TinyFish automated research discovery |
| `GET` | `/api/cities/:id/tabs` | List installed built-in and dynamic dock plugins |
| `POST` | `/api/cities/:id/tabs` | Mount or create a dynamic dock plugin |
| `GET` | `/api/cities/:id/tabs/:tabId/srcdoc` | Serve sandboxed HTML payload for iframe bridge |
| `GET/POST` | `/api/mcp` | MCP Server protocol endpoint (SSE / JSON-RPC) |
| `GET` | `/.well-known/llms.txt` | Standard machine-readable agent discovery document |
