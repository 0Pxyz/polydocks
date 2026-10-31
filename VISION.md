# PolyDocks Vision

> Status: north star. Labels below are strict: **IMPLEMENTED** = code evidence on `main`, **TARGET** = not built.

## The system in one paragraph

PolyDocks is a **microkernel**. The core stays minimal: **dock + capability bus + plugin lifecycle/policy + sandbox bridge**. Everything else is a plugin: maps, cities, notes, files, browser, and the agent itself — a privileged first-party plugin with permissions in its manifest, subject to the same policy as every other plugin. The core never understands domain concepts: plugins remember context, the core only passes an opaque `contextId`. The user downloads the app, receives their agent running in a per-user sandbox, and that agent controls the dock and builds plugins that appear in the UI.

## The loop that matters

```
user → app → per-user sandbox → agent (privileged plugin)
  → controls the dock (open / close / edit / pin / list)
  → builds plugins (create → verify → publish → install)
  → plugins appear in the UI as dock surfaces
```

Our focus is teaching the agent to control the dock and to build good plugins. Anything that does not serve that is a candidate for removal.

## What IMPLEMENTED today (evidence)

- Agent tool loop over the Meta Model API: `server/agent/loop.ts:223`, `tool_choice: "auto"` (`loop.ts:666`), SSE streaming, 45-tool full catalog + 11-verb minimal catalog (`server/agent/tools/index.ts:123,175,194-196`).
- Plugin isolation: zod manifest (`server/plugins/manifest.ts:85-111`), capability bus with policy/timeout/audit (`server/plugins/bus.ts:182-482`), iframe `sandbox="allow-scripts"` srcdoc (`src/features/dock/DynamicPluginSandbox.tsx:220`), `postMessage` bridge (`src/features/dock/bridge/host-bridge.ts`).
- Lifecycle/policy: install policy gate default `ask` (`server/agent/installPolicy.ts:4-27`), server-verified receipts (`server/agent/receipts.ts`), version history + rollback, `INSTALL_POLICY` in env.
- Agent creates plugins end-to-end (create → verify → mount → operate → publish), same-envelope route/CLI/tool handlers (`server/facade/shared.ts`).

## What TARGET (not built)

- Per-user sandbox (Modal). Today: single-tenant local process / one Docker service (`docker-compose.yml`), no auth (`server/identity.ts:11` falls back to `"local"`, self-asserted header).
- UI = only dock + plugins. The retired city/world views live on the `future/city-experience` branch, not in core.
- Agent as a first-party plugin under the same policy. Today: the agent is core code with a hardcoded 45-tool catalog.
- `plugins.install` on the full agent surface. Today: install exists only as a minimal-surface verb and HTTP/CLI routes.
- Opaque `workspaceId`. Scope is a plain workspace id everywhere: routes, tools, tables, and the front.

## Adopted decisions (from archived work, code not merged)

- **Plugin vs core** (branch `docs/plugin-core-readme`): core = runtime/routes, agent loop, permission/approval engine, persistence, sandbox bridge, secrets/keys. Everything else — every tool the agent builds — is a single-file manifest plugin, sandboxed, bridge-only. Store is local: publish shares to the on-machine community registry with history and one-click install; review/signing/remote sharing are post-demo.
- **One agent and its dock** (branch `feat/agent-dock-model`, skill `server/agent/skills/app-overview.md`): per request, `find_capabilities` first, then store install, only then create. Never duplicate: open or operate what exists; fix = inspect, then patch in place.
- **Minimal surface** (branch `feat/agent-surface-minimal`, `AGENT_SURFACE` in `.env.example:41`): intent-scoped verb tools with whole-tool and per-action denylists — the progressive-disclosure mechanism for the target catalog.

## Non-goals

Maintaining domain logic in core. New product surfaces built as core views. Any auth theater: until real per-user isolation ships, the system is documented as single-user local.
