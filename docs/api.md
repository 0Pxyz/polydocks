# Polymax Product API

Three product APIs. Everything else is infrastructure. The model is one page:
[model.md](model.md) — a plugin is an experience that lives in the dock;
four verbs (open, close, edit, pin).

| Surface | Controls | Shape |
| :--- | :--- | :--- |
| `/api/plugins` | Plugin lifecycle (create/edit/install/uninstall/operate, registry) and **every** capability as `POST /api/plugins/:id/:capability` | `{ ok, data?, events? }` / `{ ok:false, error, retryable, code? }` |
| `/api/dock` | Dock verbs: open/close/pin/unpin/list tabs, city scope enter/get, appearance apply | Same envelope; state changes also emit `events[]` |
| `/api/agent` | Agent loop (`POST /api/agent`, SSE), sessions, tasks, approvals, memory, thread, models, status | Same envelope; loop streams SSE |

Infrastructure (not product): `GET /api/health`, `wss /api/voice/realtime` (key stays server-side), static `dist/` + SPA fallback, `GET /api/media/image-cache/:file`, `POST /api/share-card`, `/.well-known/*`, legacy data routes (kept, untouched).

## Route inventory

Product routes delegate to one shared layer (`server/facade/shared.ts`); the HTTP route, the CLI (`bin/polydocks`) and the thin agent tools (`plugins.*`, `dock.*`, `agent.*`) call the same functions, so the same input gives the same result and the same events on all three surfaces (`tests/product-surface.test.ts`).

| Current route | Surface | Notes |
| :--- | :--- | :--- |
| `POST /api/plugins/:pluginId/:capability` | plugins | Canonical invoke; CLI `plugins invoke` and `plugins.operate` delegate here |
| `POST /api/plugins/lifecycle` | plugins | Synthesis lifecycle (`create\|modify\|publish\|install\|uninstall`); agent create/install/publish gated by `INSTALL_POLICY` |
| `POST /api/dock/action` | dock | Verbs (`tabs.open/close/pin/unpin/list/create/update`, `scope.enter/get`, `appearance.apply`) |
| `GET /api/dock/tabs` | dock | Tabs mounted in the dock |
| `GET /api/plugins`, `POST /:id/toggle`, `DELETE /:id`, `GET /:id/executions` | plugins | Lifecycle + introspection |
| `GET /api/capabilities`, `POST /invoke`, `POST /:id/invoke` | plugins | Discovery; approvals under it conceptually belong to agent (see below) |
| `GET /api/registry`, `POST /publish`, `POST /:id/install` | plugins | Community store |
| `GET /api/cities`, `GET /:id`, `GET /:id/sources`, `GET /:id/feed`, `POST /:id/feed/refresh`, `GET /:id/files`, `POST /:id/files` | plugins | City/plugin data reads (sources, files, notes, quests, search, cities) |
| `GET /api/maps*`, `GET /api/world*` | plugins | Map/city data backing dock views |
| `GET /api/reader` | plugins | First-party reader backend (SSRF-guarded) |
| `POST /api/mcp` | plugins | External agents drive capabilities over MCP |
| `POST /api/plugins/mcp/connect`, `POST /install-url` | plugins | Lifecycle transports |
| `GET /api/cities/:id/tabs`, `/:id/tabs/:tabId/srcdoc`, `/:id/features/:tabId` | dock | Tabs mounted in the dock |
| `GET /api/workspaces*` (incl. `:id/plugins`, `srcdoc`) | dock | Workspace = dock scope; mounts per workspace |
| `POST /api/dock/action`, `GET /api/dock/tabs`, `POST /api/dock/scope`, `POST /api/dock/appearance` | dock | Facade (`PRODUCT_SURFACE=facade`); delegates to existing tab/enter/theme executors |
| `POST /api/agent` (SSE) | agent | Tool-calling loop |
| `GET /api/sessions`, `/tasks` (+ `/api/agent/sessions`, `/api/agent/tasks` under facade) | agent | Same routers, product paths under facade |
| `GET|PUT /api/agent/memory`, `POST /recall`, `/record` | agent | Durable memory |
| `GET /api/agent/thread*` | agent | Persistent transcript |
| `GET|POST /api/capabilities/approvals*` (+ `/api/agent/approvals*` under facade) | agent | Approval queue |
| `GET /api/agent/models`, `GET /api/agent/status` | agent | Facade only: roles (no secrets) and runtime counts |
| `POST /api/agent/memory` | agent | Facade verb over the same memory store (`{op: recall\|record}`) |
| `GET|POST|DELETE /api/cities/:id/conversation` | agent | Per-city agent thread |
| `GET /api/cities/:id/build/stream` | agent | Agent-driven city build stream |
| `GET|POST /api/experiences/:id/errors` | agent | Generated-UI runtime errors (introspection) |
| `GET /api/artifacts*` | agent | Outputs of agent runs |

## Modes

```bash
PRODUCT_SURFACE=legacy  # default: current routes only
PRODUCT_SURFACE=facade  # also mounts /api/dock + /api/agent/* aliases
AGENT_SURFACE=full      # default: current 45-tool catalog
AGENT_SURFACE=minimal   # verb tools only: dock.open/close/pin/unpin/list + plugins.create/edit/install/uninstall/operate
```

The facade becomes the default only when it measures equal or better on the golden paths (TikTok request, Pomodoro benchmark, Bitcoin restyle) — comparison log lives with the release notes, not here.

## Examples

```bash
# plugins: operate a capability (same as CLI `plugins invoke` and tool `plugins.operate`)
curl -s -X POST localhost:3000/api/plugins/cities/quest_add \
  -H 'Content-Type: application/json' \
  -d '{"input":{"cityId":"stoicism","title":"Read the Enchiridion","xpReward":50}}'

# dock: list tabs, enter a city, apply appearance
curl -s 'localhost:3000/api/dock/tabs?cityId=stoicism'                       # PRODUCT_SURFACE=facade
curl -s -X POST localhost:3000/api/dock/action \
  -H 'Content-Type: application/json' \
  -d '{"op":"tabs.open","tabId":"notes","cityId":"stoicism"}'
curl -s -X POST localhost:3000/api/dock/scope \
  -H 'Content-Type: application/json' -d '{"cityId":"stoicism"}'

# agent: status, models, approvals, sessions, tasks, memory
curl -s localhost:3000/api/agent/status                                   # PRODUCT_SURFACE=facade
curl -s localhost:3000/api/agent/models
curl -s -X POST localhost:3000/api/agent/approvals/abc123 \
  -H 'Content-Type: application/json' -d '{"decision":"allow_once"}'

# CLI parity (same handlers, same envelope with --json)
bun bin/polydocks plugins invoke cities quest_add --title "Read" --city stoicism --json
bun bin/polydocks plugins lifecycle --op create --id my-tool --name "My Tool" --description "..." --code "..." --workspaceId default
bun bin/polydocks dock tabs --city stoicism --json
bun bin/polydocks dock open notes --city stoicism --json
bun bin/polydocks dock pin my-tool --city stoicism --json
bun bin/polydocks agent status --json
```
