# TinyFish Web Discovery & City Feed Architecture

> **Status:** Architecture Reference & Specification  
> **Source of Truth:** Verified against [docs.tinyfish.ai](https://docs.tinyfish.ai)  
> **Runtime Target:** `server/discovery/tinyfish.ts` and `server/agent/tools/`

---

## 1. Role in Polymax

TinyFish provides Polymax with external web intelligence. When a user creates or enters a city (e.g., "Quantum Computing", "Distributed Systems", "Stoicism"), Polymax uses TinyFish to:
1. Search authoritative sources across web, news, and academic research papers.
2. Fetch clean markdown contents in batch.
3. Construct a live, curated **City Feed** (`feed.json`) stored in the city workspace.
4. Transform discovered content into learning quests and browser tabs.

---

## 2. API Endpoints & Capabilities

### 2.1. Search API
- **Endpoint:** `GET https://api.search.tinyfish.ai`
- **Query Parameters:**
  - `q`: Search query string
  - `domain_type`: `web` | `news` | `research_paper`
  - `limit`: Number of results (default 5, max 20)
- **Daily Quota:** 12,000 free searches per day.

### 2.2. Fetch API
- **Endpoint:** `POST https://api.fetch.tinyfish.ai`
- **Payload:**
  ```json
  {
    "urls": ["https://arxiv.org/abs/2301.12345", "https://news.ycombinator.com/item?id=..."],
    "format": "markdown"
  }
  ```
- **Batching:** Up to 10 URLs per request.
- **Daily Quota:** 1,000 fetched URLs per day.

### 2.3. Automation Research API (Background Only)
- **Endpoint:** `POST https://agent.tinyfish.ai/v1/automation/run-research`
- **Latency:** 3–7 minutes.
- **Policy:** Never run inside the synchronous agent loop; queued strictly as an asynchronous background worker when deep dossier generation is requested.

---

## 3. Caching & SQLite Ledger

To stay within quota and provide sub-second responses:
- Every search query and fetched URL is hashed and stored in local SQLite (`bun:sqlite`).
- Cache TTL: 24 hours for `news`, 7 days for `research_paper` and `web`.
- Before dispatching network requests, `server/discovery/tinyfish.ts` checks SQLite cache.

---

## 4. City Feed Schema & Workspace Storage

Discovered articles, papers, and videos are saved directly into the city's workspace directory:
- Metadata & summary: `workspace/<city-id>/feed.json`
- Raw fetched content: `workspace/<city-id>/sources/<hash>.json`

```json
{
  "cityId": "distributed-systems",
  "generatedAt": "2026-10-27T22:30:00Z",
  "items": [
    {
      "id": "item-raft-consensus",
      "title": "In Search of an Understandable Consensus Algorithm (Raft)",
      "url": "https://raft.github.io/raft.pdf",
      "kind": "paper",
      "difficulty": "intermediate",
      "summary": "Foundational paper detailing state machine replication and leader election.",
      "readTimeMinutes": 30,
      "questId": "quest-understand-raft"
    }
  ]
}
```

---

## 5. Untrusted Data Security Guard

Web content returned by TinyFish is **untrusted**:
1. Page text is truncated to **16 KB** max before ingestion.
2. When injected into prompt context, content is strictly wrapped in `<untrusted_web_data>` blocks.
3. System prompts explicitly instruct the Meta Muse model to treat all web text as inert data, strictly ignoring any embedded prompt injections or command overrides.
