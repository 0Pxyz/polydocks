# TinyFish Web Discovery & City Feed Architecture

> **Status:** Architecture Reference & Specification  
> **Source of Truth:** Verified against [docs.tinyfish.ai](https://docs.tinyfish.ai) and [docs.tinyfish.ai/for-coding-agents](https://docs.tinyfish.ai/for-coding-agents)  
> **Runtime Target:** `server/discovery/tinyfish.ts`, `server/agent/tools/`, and `server/agent/skills/web-research.md`

---

## 1. Role in Polymax

TinyFish provides Polymax with external web intelligence. When a user creates or enters a city (e.g., "Quantum Computing", "Distributed Systems", "Stoicism"), Polymax uses TinyFish to:
1. Search authoritative sources across web, news, and academic research papers.
2. Fetch clean markdown contents in batch via Chromium rendering.
3. Construct a live, curated **City Feed** (`feed.json`) rendered as a beautiful **Feed Dock Tab**.
4. Transform discovered content into learning quests and browser tabs.

---

## 2. Integration Modes (Coding Agents Guide Reference)

According to [docs.tinyfish.ai/for-coding-agents](https://docs.tinyfish.ai/for-coding-agents), TinyFish supports two complementary integration modes:

### 2.1. Model Context Protocol (MCP) — *Recommended for Agentic Clients*
External AI agents (Cursor, Claude Code, Antigravity) and the internal orchestrator can connect directly to TinyFish as an MCP server:
```bash
# Claude Code / Coding Agents MCP connection:
npx -y install-mcp@latest https://agent.tinyfish.ai/mcp --client claude-code
```
This enables zero-config tool calling for `search`, `fetch`, and automated browser tasks.

### 2.2. Official SDK & Direct REST Integration (Polymax Backend)
The Polymax backend (`server/discovery/tinyfish.ts`) integrates via the official `@tiny-fish/sdk` (or typed REST calls) using the server's `TINYFISH_API_KEY`:

```typescript
// Typical latency & timeouts per coding agent reference:
// - Search: 1–3s (timeout: 10s)
// - Fetch:  1–20s (timeout: 150s)
export interface TinyFishConfig {
  apiKey: string;
  searchBaseUrl: "https://api.search.tinyfish.ai";
  fetchBaseUrl: "https://api.fetch.tinyfish.ai";
}
```

---

## 3. Endpoints & Latency Profile

| Capability | Endpoint | Latency | Daily Quota | Output Format |
| :--- | :--- | :--- | :--- | :--- |
| **Search** | `GET https://api.search.tinyfish.ai` | 1–3s | 12,000 / day | Structured JSON search hits |
| **Fetch** | `POST https://api.fetch.tinyfish.ai` | 1–20s | 1,000 / day | Clean Markdown (via Chromium) |
| **Research** | `POST https://agent.tinyfish.ai/v1/automation/run-research` | 3–7m | Background only | Deep dossier report |

### 3.1. Search API Parameters
- `q`: Search query string (e.g. `"Raft consensus algorithm visual tutorial"`)
- `domain_type`: `research_paper` | `web` | `news`
- `limit`: Number of results (default 5, max 20)

### 3.2. Batch Fetch API Parameters
- `urls`: Array of URLs to render and convert to Markdown (max 10 per request)
- `format`: `"markdown"`

---

## 4. How the Muse Agent Researches Topics

The Meta Muse agent (`muse-spark-1.3`) is equipped with the `web-research` skill (`server/agent/skills/web-research.md`) and two dedicated tools:
1. `search_web`: Fast semantic discovery across research papers, news, and technical websites.
2. `fetch_page`: Deep retrieval of full article and paper contents for extraction and summarization.

### Flow Diagram: Autonomous Discovery to Dock Feed
```
[User prompts or enters City]
             │
             v
   [Muse Agent Loop] ──(needs content)──> [search_web(query, domain_type)]
             │                                        │
             │ <─────── returns structured URLs ──────┘
             v
   [fetch_page(urls)] ──> TinyFish Chromium Renderer ──> Clean Markdown
             │
             v
   [Muse synthesizes findings]
             │
             ├──> Writes workspace/<city>/feed.json (Curated items with tags & read time)
             ├──> Saves raw markdown to workspace/<city>/sources/<hash>.json
             └──> Emits SSE event: tray.open { tab: "feed" }
```

---

## 5. The Feed Dock Plugin ("Feed Tab")

Discovered sources are not just raw files on disk; they power the **Feed Tab** on the Agentic Dock.

### 5.1. UI Components of the Feed Tab:
- **Card Grid:** Clean, dark-mode cards matching `#0A0A0C` and `#C8FF57` tokens.
- **Badge Indicators:** Distinct badges for `Paper`, `Video`, `Guide`, `Article`, and `News`.
- **Metadata:** Read time estimate, author/publication, and educational difficulty (`beginner`, `intermediate`, `advanced`).
- **One-Click Actions:**
  - **"Open in Browser"**: Calls `open_intent` to launch the Browser Dock Tab primed with the URL.
  - **"Open in Papers"**: Launches the PDF / markdown paper viewer in the Papers Tab.
  - **"Add to Quest"**: Converts the item into a milestone on the World Map quest line for XP rewards.

### 5.2. Workspace Feed Schema (`workspace/<city>/feed.json`):
```json
{
  "cityId": "distributed-systems",
  "topic": "Distributed Consensus & State Machine Replication",
  "updatedAt": "2026-10-27T22:30:00Z",
  "items": [
    {
      "id": "feed-raft-visual",
      "title": "The Secret Lives of Data: Raft",
      "url": "http://thesecretlivesofdata.com/raft/",
      "kind": "guide",
      "summary": "An interactive step-by-step visual animation of Raft leader election and log replication.",
      "difficulty": "beginner",
      "readTimeMinutes": 10,
      "tags": ["consensus", "animation", "raft"],
      "authorOrSource": "Ben Johnson",
      "questTitle": "Visualize Raft Election"
    },
    {
      "id": "feed-raft-paper",
      "title": "In Search of an Understandable Consensus Algorithm (Extended Version)",
      "url": "https://raft.github.io/raft.pdf",
      "kind": "paper",
      "summary": "Stanford's seminal paper introducing Raft as a readable, robust alternative to Paxos.",
      "difficulty": "intermediate",
      "readTimeMinutes": 45,
      "tags": ["paper", "academic", "consensus"],
      "authorOrSource": "Diego Ongaro and John Ousterhout (Stanford University)",
      "questTitle": "Read Foundational Raft Paper"
    }
  ]
}
```

---

## 6. Performance Caching & Security Guardrails

### 6.1. SQLite Cache Ledger (`bun:sqlite`)
To guarantee sub-second responses and stay well below rate limits:
- Queries and URLs are hashed (`SHA-256`) and cached in SQLite.
- Search queries cached for 24h (`news`) or 7 days (`research_paper`, `web`).
- Fetched markdown cached indefinitely per URL hash until manually invalidated.

### 6.2. Untrusted Content Guardrails
1. **Truncation:** Fetched markdown is capped at **16 KB** to prevent prompt stuffing.
2. **Data-Only Wrapping:** When injected into prompt context, page content is strictly encapsulated:
   ```xml
   <untrusted_web_source url="https://...">
   ... inert markdown content ...
   </untrusted_web_source>
   ```
3. **Instruction Shielding:** System prompts mandate that Muse ignores any prompt injections, command directives, or jailbreak attempts inside fetched content.
