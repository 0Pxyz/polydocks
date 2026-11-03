# TinyFish Web Discovery & Sources Architecture

> **Status:** Architecture Reference & Specification  
> **Source of Truth:** Verified against [docs.tinyfish.ai](https://docs.tinyfish.ai) and [docs.tinyfish.ai/for-coding-agents](https://docs.tinyfish.ai/for-coding-agents)  
> **Runtime Target:** `server/discovery/tinyfish.ts`, `server/agent/tools/`, and `server/agent/skills/web-research.md`

---

## 1. Role in Polymax

TinyFish provides Polymax with external web intelligence. When the user asks for research, Polymax uses TinyFish to:
1. Search authoritative sources across web, news, and academic research papers.
2. Fetch clean markdown contents in batch via Chromium rendering.
3. Save enriched items to the workspace `sources` table (dedupe + kind/title/image/site).
4. Open the best hits in the Browser surface or the in-app Reader.

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

### Flow Diagram: Autonomous Discovery to Saved Sources
```
[User asks for research]
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
             ├──> sources.add enriches + dedupes into the workspace sources table
             └──> open_source shows the best hit in the Browser surface
```

---

## 5. Saved Sources (Workspace Table)

Discovered sources live in the `sources` table, keyed by workspace
(`UNIQUE(workspace_id, url)`), enriched server-side (kind, title, image,
site, publish date, read time). Surfaces read from there: the Browser
opens any URL, the in-app Reader renders articles/videos.

### 5.1. Source Kinds
- Distinct kinds for `paper`, `video`, `guide`, `article`, and `news`.
- Metadata: read time estimate, author/publication.
- One-click action: **"Open in Browser"** opens the URL in the native Browser surface.

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
