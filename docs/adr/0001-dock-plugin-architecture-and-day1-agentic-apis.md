# ADR 0001: Dock Plugin Architecture, Workspace Isolation, and Day-1 Agentic APIs (MCP & llms.txt)

- **Status:** Accepted  
- **Date:** 2026-10-27  
- **Authors:** Polymax Architecture Team  
- **Context:** Meta Global AI Developer Hackathon  

---

## 1. Context and Problem Statement

Modern AI developer environments often suffer from two major anti-patterns:
1. **Chat Sprawl:** Interacting through an infinite vertical chat-bubble feed disconnected from the user's actual files and visual context.
2. **Proprietary Canvas / Database Lock-in:** Storing user research, notes, and tools in opaque cloud database blobs or complex spatial coordinate layouts.

Furthermore, hackathon judges and external developer agents need to interact with the system seamlessly from Day 1 without complex manual onboarding.

---

## 2. Decision Drivers

- **Focus & Flow:** The interface must provide a single viewport focus with zero floating window chaos.
- **Portability & Ownership:** The user's research, notes, and synthesized tools must exist as plain POSIX files on disk.
- **Agent Extensibility:** The agent must be able to synthesize new UI tools ("plugins") on demand, inspect active tab state, and dispatch open intents.
- **Agentic from Day 1:** External agents (Claude, Cursor, Antigravity) and automated evaluators must be able to discover and interact with the Polymax world immediately.

---

## 3. Considered Options

1. **Infinite Spatial Canvas (like Miro or Maestri)**
   - *Pros:* High freedom of node placement.
   - *Cons:* High cognitive overhead, complex camera math, distracted learning.
2. **Standard Chat Assistant with Sidebar (like ChatGPT / Claude Web)**
   - *Pros:* Familiar.
   - *Cons:* Unoriginal, fails the hackathon design criteria, disconnects agent from visual tools.
3. **The Agentic Dock + Filesystem Workspace + MCP Server (Selected)**
   - Pinned control surface with unified dock plugins.
   - Everything rendered into the main viewport on demand.
   - POSIX directories per city with declarative state (`workspace.json`).
   - Native MCP Server and `llms.txt` endpoints for Day-1 interoperability.

---

## 4. Decision Outcome

We decided on Option 3:
1. **Dock as the Universal Control Surface:** Built-in and agent-synthesized dynamic tools share the exact same plugin contract (`DockPluginManifest`).
2. **Safe Guest Runtime:** Dynamic tabs are generated as single-file HTML/JS bundles running in `<iframe sandbox="allow-scripts" srcdoc="...">` communicating via `window.polymax` `postMessage` bridge.
3. **Automated Discovery via TinyFish:** Automated web search and fetching upon entering a city, producing a curated `feed.json` and research quests.
4. **Day-1 Agentic APIs:**
   - Expose `/.well-known/llms.txt` for machine-readable discovery.
   - Expose `/api/mcp` implementing the Model Context Protocol (tools: `list_cities`, `get_city_workspace`, `create_city_note`, `synthesize_dock_plugin`, `run_tinyfish_research`).
   - Clean, lightweight Hono API on Bun (<5ms latency).

---

## 5. Consequences

### Positive:
- Clean, focused UI with zero clutter.
- Real POSIX persistence: notes are standard Markdown viewable in Obsidian or VS Code.
- External agents can drive Polymax through standard MCP without bespoke scrapers.
- Fast, deterministic evaluation path for hackathon judges.

### Negative / Trade-offs:
- Sandboxed iframes require explicit bridge messaging for storage and navigation.
- Web fetched content must be strictly capped and sanitized to prevent prompt injections.
