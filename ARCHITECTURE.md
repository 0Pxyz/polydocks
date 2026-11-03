# PolyDocks Architecture: Today / Target / Gaps

> Source of truth: `main` at `21f2494`. Every IMPLEMENTED claim cites `file:line`. Anything without evidence is under Target or Gaps.

## 1. Today (IMPLEMENTED)

**Runtime.** One Bun + Hono process serves API + built front (`server/index.ts`). Local: `bun run dev` (Vite :5173 proxy → :3000). Prod: `Dockerfile` + `docker-compose.yml` (single service `polymax-app`, `127.0.0.1:3000`, volumes `./data:/app/data` + `agent-home-data:/app/agent-home`). No Modal SDK, no `server/sandbox*` — "sandbox" today means browser iframe + path-traversal guard (`server/system/filesystem.ts:35-97`).

**Agent.** `runAgentLoop` (`server/agent/loop.ts:223`), OpenAI SDK against `MODEL_BASE_URL`/`MODEL_ID` (`server/agent/llm.ts:9-14`), zod-validated calls with 2 retries, duplicate-call guard, SSE events (`tool.start/done`, `tray.open`, `tab.created`, `plugin.*`, `map.*`). Catalog: 45 full tools + 11 minimal verbs (`server/agent/tools/index.ts:123,175,194-196`), skills in `server/agent/skills/*.md` (max 2 per turn). No `create_tool`, no shell executor, no `eval` in server.

**Plugin system.** Manifest `apiVersion: 1` (`server/plugins/manifest.ts:85-129`), registry install/enable/disable + version archive (`server/plugins/registry.ts:47-171`), capability bus with risk policy, 30s timeout, `executions` audit (`server/plugins/bus.ts:182-541`), receipts (`server/agent/receipts.ts:33-112`), slop validator, SSRF guard (`server/plugins/ssrf.ts`), one real `spawn` site allowlisted with timeout/cap (`server/plugins/context.ts:219`). Guests: iframe `sandbox="allow-scripts"` srcdoc + `window.polymax` bridge. Host lifecycle: mount/hide/hibernate, `LIVE_TAB_LIMIT = 5` (`src/lib/tabs/tabHostStore.ts:44`).

**Data.** `bun:sqlite` at `DATA_DIR/polymax.db` (`server/workspace/db.ts:11-16`), 28 `CREATE TABLE` in `server/workspace/schema.sql`, idempotent, unversioned. Agent home files (`server/system/agentHome.ts`). Unified `sources` table keyed by workspace (`UNIQUE(workspace_id, url)`); retired knowledge-map tables dropped from the schema with a data-preserving boot migration (`server/workspace/db.ts`). Orphan `dock_items` table live with zero code references.

**Identity.** None: `resolveUserId` falls back to `"local"` (`server/identity.ts:11-39`), header is self-asserted. No route has real auth (per-plugin secrets are scoped server-side).

**Knowledge-map coupling removed.** The retired knowledge-map experience is parked on the `future/city-experience` branch. Mainline has no knowledge-map routes, tools, views, tables, or skills: one word-boundary `grep -rniw city` over `src server docs tests` returns only the documented exceptions (boot migration strings, retired-route 404 assertions, parked-branch mentions, immutable history).

## 2. Target

Microkernel core (enumerated in §4): runtime/routes, agent loop transport, permission/approval engine, persistence, sandbox bridge, secrets/keys. Everything else — browser, reader, notes, files, voice UI, and — as target — the agent as a privileged first-party plugin (manifest permissions, same policy) — is a plugin. Core passes an opaque `contextId`; plugins own domain state. Per-user sandboxed runtime (Modal). Agent catalog is intent-scoped (minimal surface default); install/publish/operate close the plugin loop on every surface.

## 3. Gaps (ordered by impact)

| # | Gap | Evidence it is real |
|---|---|---|
| 1 | No per-user isolation or auth | `server/identity.ts`, single `polymax.db`, compose has no tenants |
| 2 | Knowledge-map hardcoded in core | removed; experience parked on `future/city-experience` |
| 3 | `plugins.install` missing from full agent surface | only `verbs/plugins.ts:53-65` (minimal) + HTTP/CLI |
| 4 | Split-brain persistence (client pins / `dock_pins` / in-memory tab host) | `useDockStore.ts:10-30`, `schema.sql`, `tabHostStore.ts` |
| 5 | No migrations, drift (`dock_items` orphan, `image_spend` outside schema) | `schema.sql` vs live DB; `server/media/budget.ts:11` |
| 6 | Agent is core, not a plugin | 45-tool hardcoded catalog, prompt in `loop.ts:183-218` |
| 7 | Remote branches/stashes hold unmerged value (Sources iterations, slop/policy stack copies) | `internal-docs/CLEANUP-PROPOSALS.md` |

## 4. What stays core (never a plugin)

Runtime + routes, agent loop transport, permission/approval engine, persistence, sandbox bridge, secrets/keys. (Adopted from `docs/plugin-core-readme`; the knowledge-map experience was removed to a parked branch instead of extracted.)
