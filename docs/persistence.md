# Persistence: one source of truth per data type

Ownership map for workspace and product state (issue #165). Every type has
exactly one writer path and one read path. Migrations are additive and
reversible: backfill first, verify, remove later. Nothing below deletes
legacy data in the same change that introduces its replacement.

## Sources of truth

| Data | Source of truth | Writers | Readers | Legacy (compat only) |
|---|---|---|---|---|
| Sources (feed) | `sources` table (`city_id`, `url` unique) | `sources.add` capability, `feedGenerator` backfill, `fetch_page` via bus | Feed UI, `sources.list/open`, `getCityContext` | `workspace/<city>/feed.json` (read by `GET /:id/feed`), `workspace/<city>/sources/*.json` (migrated on registration), `city_sources` table (no longer written, kept) |
| Audit | `audit_log` via `recordAudit` | `recordAudit` only (`services/audit.ts`) | `getAuditLogs`, executions UI | `appendAuditLog` (delegates to `recordAudit`), `workspace/.audit.log` file (removed) |
| Plugin code + versions | `plugin_files` (`workspace_id`, `plugin_id`, `version`) | `upsertPluginFile`, `PluginService`, backfill from `plugin_versions` | `readFeature`, `getPluginFile`, `listPluginFiles`, versions UI | `plugin_versions` (kept, backfilled into `plugin_files`; removal deferred) |
| Plugin registry | `plugins` table + `registry_plugins` | `pluginRegistry`, `installFromRegistry` | dock, store UI, capability bus | — |
| Pins | `dock_pins` | `pinDockItem`/`unpinDockItem` (agent, CLI, routes) | `listDockPins`, `dockAction` | `workspace.json` `pinnedTabs` (read-only display), client pin cache (read cache) |
| Dock state | `dock_items` (opaque `contextId`) | host only (mount/hide/hibernate) | dock UI, `dockAction` | — |
| Conversation (interactive) | `agent_threads` + `agent_thread_messages` (+ rolling summary) | `runAgentLoop` (thread path) | `getThreadContext` (24 msgs / 6000 tok window) | `city_conversations` + `conversation_messages` (legacy city chat, used when no thread user; removal with #153) |
| Sessions/tasks | `sessions` + `tasks` tables (DDL owned by `workspace/sessions.ts`) | `SessionService`/`TaskService` | `agentSession`/`agentTask` facade, legacy routes | `agent-home/sessions/*.jsonl` (transcript store; mirrored into `session_transcripts`, reads stay on JSONL) |
| Task transcripts | JSONL files (current store) | `appendSessionTranscript` (+ SQLite mirror) | `readSessionTranscript` (JSONL) | `session_transcripts` is the verification mirror, not yet the read path |
| Session↔thread link | session `metadata_json.threadUserId`, task `input_json.userId` | `runAgentLoop` (task path), `POST /:id/run` | `getSession().metadata`, task input | — |
| Workspaces | `workspaces` table (`kind`: `workspace` \| `city`) | `createWorkspace`, `ensureCityWorkspaces` backfill | `WorkspaceService`, loop scope `city-<id>` | `cities` table (city registry written by build/cities-ensure), city workspace dirs (files) |
| Memory (durable) | `MEMORY.md` + daily logs (`agent-home/memory/`) | `record_memory`, agent | `recall_memory` (scored, budgeted) | — |
| Memory (rolling) | thread `summary` | `maybeCompactAgentThread` | `getThreadContext` | — (never merged with MEMORY.md by design) |

## What this change does (and does not do)

- `feedGenerator` now writes canonical `sources` rows (dedupe on
  `(city_id, url)`) and keeps the `feed.json` write for the legacy `/feed`
  reader. `city_sources` is no longer written; the table stays until #153
  (zero writers proven by test).
- All audit writes go through `recordAudit`. The `.audit.log` file mirror
  is removed; `appendAuditLog` delegates to `recordAudit`.
- `plugin_versions` rows are backfilled into `plugin_files` on boot
  (idempotent `INSERT OR IGNORE`). Both tables stay; `plugin_files` is the
  documented read path for code, `plugin_versions.status` keeps the
  active/superseded signal until the facade reads status from versions
  uniformly.
- Sessions/tasks DDL has one owner (`workspace/sessions.ts`); `taskRunner`
  calls it instead of carrying a duplicate.
- Transcript appends dual-write JSONL + `session_transcripts`. Reads stay
  on JSONL; dropping JSONL needs the verification window (follow-up).
- City rows get `city-<id>` workspaces (`kind='city'`, additive). The full
  city migration (compat paths, dead-table removal) belongs to #153.
- `city_tabs`, `city_notes` (zero writers) and `city_sources` (no longer
  written) stay until #153 removes them with consumer proof (tests pin the
  proof). `cities` stays as the city registry.

## Verification

- `tests/issue-165-persistence.test.ts`: audit single-writer, feed
  canonical rows without `city_sources`, versions backfill parity,
  sessions DDL single definition, transcript mirror parity, city
  workspace backfill, dead-table zero-writer proof, SoT doc presence.
- Reversibility: every migration is `INSERT OR IGNORE` / `ADD COLUMN` /
  file-compat preserving. Roll back by dropping the new rows/columns; no
  legacy data is deleted or overwritten by the backfills.
