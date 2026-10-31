# PolyDocks Vision

> Status: north star. Labels below are strict: **IMPLEMENTED** = code evidence on `main`, **TARGET** = not built.

## The system in one paragraph

PolyDocks is a **microkernel**. The core stays minimal: **dock + capability bus + plugin lifecycle/policy + sandbox bridge**. Everything else is a plugin: browser, notes, files, and the agent itself — a privileged first-party plugin with permissions in its manifest, subject to the same policy as every other plugin. The core never understands domain concepts: plugins remember context, the core only passes an opaque `contextId`. The user downloads the app, receives their agent in a per-user sandbox, and that agent controls the dock and builds plugins that appear in the UI.

## The loop that matters

```
user → app → per-user sandbox → agent (privileged plugin)
  → controls the dock (open / close / edit / pin / list)
  → builds plugins (create → verify → publish → install)
  → plugins appear in the UI as dock surfaces
```

Our focus is teaching the agent to control the dock and to build good plugins. Anything that does not serve that is a candidate for removal.

## What IMPLEMENTED today (evidence)

- Agent tool loop over the Meta Model API: `server/agent/loop.ts:226`, `tool_choice: "auto"` (`loop.ts:680`), SSE streaming, 43-tool full catalog + 16-verb minimal catalog (`server/agent/tools/index.ts:122,171,190-192`).
- Plugin isolation: zod manifest (`server/plugins/manifest.ts:85-111`), capability bus with policy/timeout/audit (`server/plugins/bus.ts`), iframe `sandbox="allow-scripts"` srcdoc (`src/features/dock/DynamicPluginSandbox.tsx:232`), `postMessage` bridge (`src/features/dock/bridge/host-bridge.ts`).
- Lifecycle/policy: install policy gate default `ask` (`server/agent/installPolicy.ts:16`, `INSTALL_POLICY` in `.env.example:61`), server-verified receipts (`server/agent/receipts.ts:91,220`), version history + rollback (`rollback_plugin` in both catalogs, registry versions table), `AGENT_SURFACE` switch (`.env.example:56`).
- Agent creates plugins end-to-end (create → verify → mount → operate → publish → install: `install_plugin` ships in the full catalog), same-envelope route/CLI/tool handlers (`server/facade/shared.ts`).
- Beside panel: the dock hosts a second on-demand tool beside the main view. Three-region rule — chat left, content middle, panel right, no overlap (`panelLayout` in `src/lib/dock/dockItems.ts:413`, eligibility in `dockItems.ts:441`); persisted ids/width/selection (`src/lib/store/useDockStore.ts:69,126`); reload restores selection and remounts beside tabs; Esc yields to fullscreen/media (`shouldYieldEscToMedia` in `dockItems.ts:377`); below 1100px the panel is a bottom sheet (`src/features/dock/BesidePanel.tsx`, `src/features/dock/ToolSurface.tsx`, covered by `tests/tool-sidebar.test.ts`).
- Community registry: publish shares to the on-machine registry with history, one-click install into any workspace (`server/plugins/communityRegistry.ts:136,232`, `tests/plugin-store.test.ts`).
- Native Browser as a first-party plugin surface: real remote-Chromium sessions with a lateral tab rail, graceful Reader fallback without a worker secret, strict-referrer video embeds (`src/features/browser/NativeBrowserView.tsx:63`, green `tests/browser/reader-smoke.ts` in CI for PRs to `main`).
- Agent execution sandbox exists as an opt-in Modal backend (`sandbox_*` tools in the full catalog); unset credentials disable it with a setup hint. Per-user tenancy is still absent (see TARGET).

## What TARGET (not built)

- Per-user isolation and auth. Today: single-tenant local process / one Docker service (`docker-compose.yml`), no auth (`server/identity.ts` falls back to `"local"`, self-asserted header).
- UI = only dock + chat + plugin surfaces. The retired knowledge-map views live on the `future/city-experience` branch, not in core. No other core views may grow beside them.
- Agent as a first-party plugin under the same policy. Today: the agent is core code with a hardcoded 43-tool catalog.
- Intent-scoped minimal surface by default. Today: `AGENT_SURFACE` defaults to `full`.
- Opaque `workspaceId`. Scope is a plain workspace id everywhere: routes, tools, tables, and the front.

## Adopted decisions (from archived work, now on main)

- **Plugin vs core**: core = runtime/routes, agent loop, permission/approval engine, persistence, sandbox bridge, secrets/keys — see `ARCHITECTURE.md` §4. Everything else — every tool the agent builds — is a single-file manifest plugin, sandboxed, bridge-only. Store is local: publish shares to the on-machine community registry with history and one-click install; review/signing/remote sharing are post-demo.
- **One agent and its dock** (`server/agent/skills/app-overview.md`): per request, `find_capabilities` first, then store install, only then create. Never duplicate: open or operate what exists; fix = inspect, then patch in place.
- **Minimal surface** (`AGENT_SURFACE` in `.env.example:56`): intent-scoped verb tools with whole-tool and per-action denylists — the progressive-disclosure mechanism for the target catalog.
- **City cleanup**: the knowledge-map experience was removed from the mainline and parked on `future/city-experience` instead of extracted as a plugin; `ARCHITECTURE.md` records the evidence bar (word-boundary `city` grep returns only documented exceptions).

## Non-goals

Maintaining domain logic in core. New product surfaces built as core views. Any auth theater: until real per-user isolation ships, the system is documented as single-user local.
