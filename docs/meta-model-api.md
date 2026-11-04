# Meta Model API Integration Guide

> **Status:** Architecture Reference & Implementation Rules  
> **Source of Truth:** Verified against [dev.meta.ai/docs](https://dev.meta.ai/docs)  
> **Runtime Target:** `server/agent/llm.ts` and `server/agent/loop.ts`

---

## 1. Core Endpoints & Authentication

The Meta Model API provides OpenAI-compatible endpoints with Meta-specific operational constraints:

- **Base URL:** `https://api.meta.ai/v1`
- **Authentication:** HTTP Header `Authorization: Bearer <MODEL_API_KEY>`
- **SDK Compatibility:** Tested with official `openai` Node/Bun SDK:
  ```typescript
  import OpenAI from "openai";
  import { config } from "../config";

  export const llm = new OpenAI({
    baseURL: config.MODEL_BASE_URL,
    apiKey: config.MODEL_API_KEY,
  });
  ```

---

## 2. Models, Roles & Selection Strategy

One model per job. Plugins declare a `modelRole`; `server/agent/modelRegistry.ts` resolves the provider from env. No plugin knows the provider, so flipping `AGENT_PROVIDER` never changes the tool catalog.

| Role | Model | Status | Where it runs |
| :--- | :--- | :--- | :--- |
| `agent` | `muse-spark-1.3` (default; `MODEL_AGENT_ID` or `MODEL_ID` override; `muse-wonder-1.0` via env for hard tasks) | Running | `runAgentLoop` in `server/agent/loop.ts`, SSE `POST /api/agent` |
| `fast` | `MODEL_FAST_ID` (default `muse-spark-1.3`) | Resolved, no dedicated caller yet | `getClientForRole("fast")` |
| `vision` | agent model by default; `MODEL_VISION_ID` pins one | Running as fallback | `loop.ts` keeps Spark/Wonder for image attachments (both take image input natively), `MODEL_VISION_ID` overrides |
| `voice` | `muse-voice-transcribe-1.0` (`MODEL_VOICE_MODEL`, `MODEL_REALTIME_URL`) | Running | `server/voice/proxy.ts` (`wss` realtime), key stays server-side |
| `image` | `muse-image-1.0` (`MODEL_IMAGE_ID`) | Running (chat requests) | `generate_image` tool → `POST /v1/images/generations`, cache `DATA_DIR/image-cache`, saved to user artifacts, served at `/api/media/image-cache/:file` |
| `agent@openweight` | `meta-models/muse-spark-open-1026` via Baseten/Modal/self-host | Toggle, needs `AGENT_PROVIDER=openweight` + `OPENWEIGHT_*` | `getClientForRole("agent")` routes to the OpenAI-compatible adapter |
| `segmentation` | `sam-3.1` (`MODEL_SEGMENTATION_ID`, Responses API) | Service present, agent tool NOT wired | `server/media/segmentation.ts` only; stays out of the demo path until voice+image+openweight are stable |

| Model Identifier | Mode | Role & Usage |
| :--- | :--- | :--- |
| `muse-spark-1.3` | **Standard** | **Default.** Fast, high-throughput, optimized for tool-calling, agent loops, and UI generation. |
| `muse-wonder-1.0` | **Standard** | Preview model, deeper reasoning, slower latency. Reserved for complex multi-paper comparisons. |
| `muse-spark-open-1026` | **Open Weight** | Open weights variant served via vLLM, Modal, or Baseten for open-weight bonus eligibility. |
| `muse-image-1.0` | **Standard** | Image generation/editing. `POST /v1/images/generations`, `POST /v1/images/edits`, or Responses API. |
| `muse-voice-transcribe-1.0` | **Standard** | Speech-to-text. `wss://api.meta.ai/v1/asr/realtime` live or `POST /v1/asr/transcribe` for files. |
| `sam-3.1` | **Standard** | Segmentation. `POST /v1/responses` with text+image, returns boxes and masks. |

> [!IMPORTANT]
> **Strict Mode Rule:** Always use standard models. **Never** use `-contributor` model variants (e.g., `muse-spark-1.3-contributor`), as user notes and files must remain private and cannot be used for upstream training.

---

## 3. Protocol Rules & Known Behaviors

### 3.1. `tool_choice`
The Meta Model API strictly supports `tool_choice: "auto"`. Passing named tools or `"required"` returns **HTTP 400 Bad Request**.

### 3.2. Tool Result Message Sequencing
When returning tool execution outputs:
1. Append the full assistant message containing the `tool_calls` array.
2. For each tool call, append a message with:
   - `role: "tool"`
   - `tool_call_id: call.id`
   - `content: JSON.stringify(result)`
3. Omitting the preceding assistant message returns **HTTP 400 Bad Request**.

### 3.3. Zod Validation & Auto-Correction Protocol
Model tool arguments are not guaranteed to conform to schema on first generation.
1. All tool arguments are parsed via strict **Zod** schemas in `server/agent/tools/*.ts`.
2. On parse failure, the zod error report is formatted and fed back as the tool result string.
3. The model is allowed a maximum of **2 retry attempts** per step before aborting that tool execution.

### 3.4. Structured Outputs (`response_format`)
When guaranteed JSON is required (e.g. `MapSpec`, `FeedSummary`):
- Use `response_format: { type: "json_schema", json_schema: { ... } }`.
- Recursive schemas are unsupported and return **HTTP 400**; schemas must maintain a flat object tree.

### 3.5. Reasoning Effort (`reasoning_effort`)
Both `muse-spark-1.3` and `muse-wonder-1.0` are reasoning models (verified against dev.meta.ai/docs/reasoning):
- On Chat Completions, pass top-level `reasoning_effort` with one of `"minimal" | "low" | "medium" | "high" | "xhigh" | "max"`. Omitting it leaves depth to the model.
- `"none"` returns **HTTP 400** on both models — never send it.
- Reasoning tokens count toward the output-token budget and billing.
- Polydocks plumbing: `conversationStore.selectedEffort` (persisted in `polydocks-agent-effort`; the picker UI was removed, the stored value and backend path stay) → `POST /api/agent { reasoningEffort }` (allowlisted in `server/index.ts`) → `runAgentLoop({ reasoningEffort })` → `reasoning_effort` on both the main and fallback `chat.completions.create` calls.

---

## 4. UI Synthesis Skill: Muse Generating Dock Plugins

The agent synthesizes UI plugins under the `plugins` skill prompt
(`server/agent/skills/plugins.md`):

1. **Self-contained:** one TSX file importing `react`, `react-dom/client`,
   and `@/components/ui/*`, mounting `#app`. No external script CDNs.
2. **Design tokens only:** kit v2 components and theme tokens — no hex
   colors, inline styles, or raw form elements (validation rejects them
   with a clear error, max 2 fix retries).
3. **Host bridge:** `window.polydocks` for storage (`polydocks.storage`),
   capabilities (`invoke`/`useCapability`), content, tasks, and theme.
4. **Contract:** `apiVersion: 1` manifest (`id`, `title`, `icon`,
   `scope`); host owns mounting, hiding, and hibernation.

---

## 5. Addendum: prefer Meta built-ins (verified 2026-10-31)

Before writing any new capability, check whether the Meta Model API already provides it. If it does, use it — do not re-implement. Source: [dev.meta.ai/docs](https://dev.meta.ai/docs) (`/tool-calling`, `/tool-search`, `/protocols`, `/protocols/responses`, `/models`, `/agent-frameworks`, `/reasoning`, `/prompt-caching`, `/search-grounding`, `/structured-output`).

- **Responses API is the recommended path** for tool loops and multi-turn agents: it preserves reasoning across turns (encrypted replay or `previous_response_id`). Chat Completions tool calling is fully supported but carries no reasoning across turns (`reasoning_content` is redacted to empty for external callers). `tool_search` and built-in `web_search` run only on Responses/Messages, never on Chat Completions.
- **Reuse before you build:** native `tool_search` (deferred namespace tools) instead of hand-rolled progressive disclosure; built-in `web_search` (server-side grounding, `url_citation`, opt-in `web_search_call.results`) instead of a custom search pipeline; automatic prefix prompt caching instead of manual cache keys; `reasoning.effort` (Responses) / `reasoning_effort` (Chat Completions) instead of custom depth heuristics; `text.format` (Responses) / `response_format` (Chat Completions) for guaranteed JSON.
- **Hard API constraints:** `tool_choice` supports only `"auto"` (named/required choices are HTTP 400). Function names allow at most one dot — group plugin-scoped functions under namespace tools. `tool_search` rules: one per request; hosted mode needs at least one deferred tool; a deferred tool without `tool_search` is HTTP 400; not combinable with structured output; requires reasoning effort other than `"none"`; keep the loaded tool set stable once loaded or the cache breaks. `web_search` reserves `browser.search` / `browser.open` / `browser.find` in the same request. `reasoning: "none"` is unsupported on Spark/Wonder (HTTP 400). On Responses, `instructions`, `tools` and `reasoning.effort` do not persist across `previous_response_id` — resend every turn.
- **Prompt caching is automatic prefix matching:** stable system prompt + tool prefix first, variable content last; watch `usage.input_tokens_details.cached_tokens`; `prompt_cache_key` only at scale; `prompt_cache_retention: "24h"` for bursty workloads.
- **Model roles (env only):** orchestrator `muse-spark-1.3` with low effort; heavy agent `muse-wonder-1.0` (preview) with higher effort. No second provider unless a concrete need appears with justification. The Claude Agent SDK spike (Messages API, `opus` -> Wonder / `sonnet+haiku+subagents` -> Spark) is evaluation-only until gates are proven preservable.
