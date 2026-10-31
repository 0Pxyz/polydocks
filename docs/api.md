# Polymax Product API

Three product APIs. Everything else is infrastructure. The model is one page:
[model.md](model.md) — a plugin is an experience that lives in the dock;
four verbs (open, close, edit, pin).

| Surface | Controls | Shape |
| :--- | :--- | :--- |
| `/api/plugins` | Plugin lifecycle (create/edit/install/uninstall/operate, versions, rollback, registry) and **every** capability as `POST /api/plugins/:id/:capability` | `{ ok, data?, events? }` / `{ ok:false, error, retryable, code? }` |
| `/api/dock` | Dock verbs: open/close/pin/unpin/list/focus/next/prev/background, chat.toggle, appearance apply | Same envelope; state changes also emit `events[]` |
| `/api/agent` | Agent loop (`POST /api/agent`, SSE), sessions, tasks, approvals, memory, thread, models, status | Same envelope; loop streams SSE |

Infrastructure (not product): `GET /api/health`, `wss /api/voice/realtime` (key stays server-side), static `dist/` + SPA fallback, `GET /api/media/image-cache/:file`, `POST /api/share-card`, `/.well-known/*`, legacy data routes (kept, untouched).

## Route inventory

Product routes delegate to one shared layer (`server/facade/shared.ts`); the HTTP route, the CLI (`bin/polydocks`) and the thin agent tools (`plugins.*`, `dock.*`, `agent.*`) call the same functions, so the same input gives the same result and the same events on all three surfaces (`tests/product-surface.test.ts`).

| Current route | Surface | Notes |
| :--- | :--- | :--- |
| `POST /api/plugins/:pluginId/:capability` | plugins | Canonical invoke; CLI `plugins invoke` and `plugins.operate` delegate here |
| `POST /api/plugins/lifecycle` | plugins | Synthesis lifecycle (`create\|modify\|publish\|install\|uninstall`); agent create/modify/install/publish gated by `INSTALL_POLICY` |
| `GET /api/plugins/:id/versions` | plugins | Kept versions (edit history for rollback) |
| `POST /api/plugins/:id/rollback` | plugins | Roll back to a kept version (workspace: new row with old content; registry: reactivate) |
| `POST /api/dock/action` | dock | Verbs (`tabs.open/close/pin/unpin/list/focus/next/prev/background`, `chat.toggle`, `tabs.create/update`, `scope.enter/get`, `appearance.apply`; registry in `docs/dock-shortcuts.md`) |
| `GET /api/dock/tabs` | dock | Tabs with `pinned` flags (durable `dock_pins` record, not just client cache) |
| `GET /api/plugins`, `POST /:id/toggle`, `DELETE /:id`, `GET /:id/executions` | plugins | Lifecycle + introspection |
| `GET /api/capabilities`, `POST /invoke`, `POST /:id/invoke` | plugins | Discovery; approvals under it conceptually belong to agent (see below) |
| `GET /api/registry`, `POST /publish`, `POST /:id/install` | plugins | Community store |
| `GET /api/reader` | plugins | First-party reader backend (SSRF-guarded) |
| `POST /api/plugins/mcp/connect` | plugins | MCP server connect (explicit user confirmation) |
| `GET /api/workspaces*` (incl. `:id/plugins` + `pinned[]`, `:id/pins` POST/DELETE, `srcdoc`) | dock | Workspace = dock scope; mounts per workspace; server pin record merged by the UI |
| `POST /api/dock/action`, `POST /api/dock/appearance` | dock | Facade (`PRODUCT_SURFACE=facade`); delegates to existing dock/theme executors |
| `POST /api/agent` (SSE) | agent | Tool-calling loop |
| `GET /api/sessions`, `/tasks` (+ `/api/agent/sessions`, `/api/agent/tasks` under facade) | agent | Same routers, product paths under facade |
| `GET|PUT /api/agent/memory`, `POST /recall`, `/record` | agent | Durable memory |
| `GET /api/agent/thread*` | agent | Persistent transcript |
| `GET|POST /api/capabilities/approvals*` (+ `/api/agent/approvals*` under facade) | agent | Approval queue |
| `GET /api/agent/models`, `GET /api/agent/status` | agent | Facade only: roles (no secrets) and runtime counts |
| `POST /api/agent/memory` | agent | Facade verb over the same memory store (`{op: recall\|record}`) |
| `GET|POST /api/experiences/:id/errors` | agent | Generated-UI runtime errors (introspection) |
| `GET /api/artifacts*` | agent | Outputs of agent runs |

## Modes

```bash
PRODUCT_SURFACE=legacy  # default: current routes only
PRODUCT_SURFACE=facade  # also mounts /api/dock + /api/agent/* aliases
AGENT_SURFACE=full      # default: current 45-tool catalog
AGENT_SURFACE=minimal   # verb tools only: dock.open/close/pin/unpin/list/focus/next/prev/background + plugins.create/edit/install/uninstall/operate
```

The facade becomes the default only when it measures equal or better on the golden paths (TikTok request, Pomodoro benchmark, Bitcoin restyle) — comparison log lives with the release notes, not here.

## Examples

```bash
# plugins: operate a capability (same as CLI `plugins invoke` and tool `plugins.operate`)
curl -s -X POST localhost:3000/api/plugins/search/search.web \
  -H 'Content-Type: application/json' \
  -d '{"input":{"query":"raft consensus","domain_type":"research_paper"}}'

# dock: list tabs, open a tool, apply appearance
curl -s localhost:3000/api/agent/dock/action -X POST \
  -H 'Content-Type: application/json' -d '{"op":"tabs.list"}'
curl -s -X POST localhost:3000/api/dock/action \
  -H 'Content-Type: application/json' -d '{"op":"tabs.open","tabId":"browser"}'

# agent: status, models, approvals, sessions, tasks, memory
curl -s localhost:3000/api/agent/status                                   # PRODUCT_SURFACE=facade
curl -s localhost:3000/api/agent/models
curl -s -X POST localhost:3000/api/agent/approvals/abc123 \
  -H 'Content-Type: application/json' -d '{"decision":"allow_once"}'

# CLI parity (same handlers, same envelope with --json)
bun bin/polydocks plugins invoke search search.web --query "raft consensus" --json
bun bin/polydocks plugins lifecycle --op create --id my-tool --name "My Tool" --description "..." --code "..." --workspaceId default
bun bin/polydocks plugins versions my-tool
bun bin/polydocks plugins rollback my-tool --version 1.0.0
bun bin/polydocks dock list --json
bun bin/polydocks dock open browser --json
bun bin/polydocks dock pin my-tool --json
bun bin/polydocks agent status --json
```
