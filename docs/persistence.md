# Persistence: one source of truth per data type

Ownership map for workspace and product state (issue #165). Every type has
exactly one writer path and one read path. Migrations are additive and
reversible: backfill first, verify, remove later. The retired city/world
tables (`cities`, `city_tabs`, `city_notes`, `city_sources`, `maps`,
`map_points`, `city_conversations`, `conversation_messages`) are dropped
from the schema; a one-way boot migration in `server/workspace/db.ts`
renames scope columns (`city_id` → `workspace_id`) with data preserved and
drops the parked tables. Workspace folders on disk are never touched. The
city experience itself lives on the `future/city-experience` branch.

## Sources of truth

| Data | Source of truth | Writers | Readers | Legacy (compat only) |
|---|---|---|---|---|
| Sources (feed) | `sources` table (`workspace_id`, `url` unique) | `sources.add` capability, `fetch_page` via bus | Browser surface, in-app Reader | `plugin_files` rows from the pre-unification migration window |
| Audit | `audit_log` via `recordAudit` | `recordAudit` only (`services/audit.ts`) | `getAuditLogs` | — |
| Plugin code + versions | `plugin_files` (`workspace_id`, `plugin_id`, `version`) | `upsertPluginFile`, `PluginService`, backfill from `plugin_versions` | `readFeature`, `getPluginFile`, `listPluginFiles`, versions UI | `plugin_versions` (kept, backfilled into `plugin_files`; removal deferred) |
| Plugin registry | `plugins` table + `registry_plugins` | `pluginRegistry`, `installFromRegistry` | dock, store UI, capability bus | — |
| Pins | `dock_pins` | `pinDockItem`/`unpinDockItem` (agent, CLI, routes) | `listDockPins`, `dockAction` | client pin cache (read cache) |
| Dock state | `dock_items` (opaque `contextId`) | host only (mount/hide/hibernate) | dock UI, `dockAction` | — |
| Conversation (interactive) | `agent_threads` + `agent_thread_messages` (+ rolling summary) | `runAgentLoop` (thread path) | `getThreadContext` (24 msgs / 6000 tok window) | — |
| Sessions/tasks | `sessions` + `tasks` tables (DDL owned by `workspace/sessions.ts`) | `SessionService`/`TaskService` | `agentSession`/`agentTask` facade, legacy routes | `agent-home/sessions/*.jsonl` (transcript store; mirrored into `session_transcripts`, reads stay on JSONL) |
| Task transcripts | JSONL files (current store) | `appendSessionTranscript` (+ SQLite mirror) | `readSessionTranscript` (JSONL) | `session_transcripts` is the verification mirror, not yet the read path |
| Session↔thread link | session `metadata_json.threadUserId`, task `input_json.userId` | `runAgentLoop` (task path), `POST /:id/run` | `getSession().metadata`, task input | — |
| Workspaces | `workspaces` table (`kind`: `workspace`) | `createWorkspace` | `WorkspaceService` | — |
| Memory (durable) | `MEMORY.md` + daily logs (`agent-home/memory/`) | `record_memory`, agent | `recall_memory` (scored, budgeted) | — |
| Memory (rolling) | thread `summary` | `maybeCompactAgentThread` | `getThreadContext` | — (never merged with MEMORY.md by design) |

## What this change does (and does not do)

- Scope columns renamed with data preserved (`city_id` → `workspace_id`
  on `sources`, `audit_log`, `executions`, `experience_errors`,
  `agent_thread_messages`), verified idempotent on reboot.
- Parked city/world tables dropped from the schema; existing databases
  shed them on boot via the one-way migration. Workspace folders on disk
  are untouched.
- All audit writes go through `recordAudit`.
- `plugin_versions` rows are backfilled into `plugin_files` on boot
  (idempotent `INSERT OR IGNORE`). Both tables stay; `plugin_files` is the
  documented read path for code, `plugin_versions.status` keeps the
  active/superseded signal until the facade reads status from versions
  uniformly.
- Sessions/tasks DDL has one owner (`workspace/sessions.ts`); `taskRunner`
  calls it instead of carrying a duplicate.
- Transcript appends dual-write JSONL + `session_transcripts`. Reads stay
  on JSONL; dropping JSONL needs the verification window (follow-up).

## Verification

- `tests/issue-165-persistence.test.ts`: audit single-writer, workspace-keyed
  sources dedupe, versions backfill parity, sessions DDL single definition,
  transcript mirror parity, retired-table absence, no-code-reference proof,
  SoT doc presence.
- Reversibility: the column renames preserve data; parked tables are gone
  from fresh installs. Roll back by checking out the pre-removal tree; the
  `future/city-experience` branch holds the readers.
