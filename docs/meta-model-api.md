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

## 2. Models & Selection Strategy

| Model Identifier | Mode | Role & Usage |
| :--- | :--- | :--- |
| `muse-spark-1.3` | **Standard** | **Default.** Fast, high-throughput, optimized for tool-calling, agent loops, and UI generation. |
| `muse-wonder-1.0` | **Standard** | Preview model, deeper reasoning, slower latency. Reserved for complex multi-paper comparisons. |
| `muse-spark-open-1026` | **Open Weight** | Open weights variant served via vLLM, Modal, or Baseten for open-weight bonus eligibility. |

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

---

## 4. UI Synthesis Skill: Muse Generating Dock Plugins

The agent synthesizes UI plugins using the canonical `create-tab.md` skill prompt:
1. **Self-Contained:** Output a single HTML/CSS/JS file (`index.html`) with no external script CDNs.
2. **Design Tokens:** Strict dark mode palette:
   - Background: `#0A0A0C`
   - Surface: `#131318`
   - Accent: `#C8FF57`
   - Border: `#23232E`
   - Typography: Syne (headers), Inter (body), Geist Mono (code)
3. **Host Bridge:** Use `window.polymax` for persistence and communication.
4. **Manifest:** Write a corresponding `manifest.json` (`id`, `title`, `icon`, `scope`).
