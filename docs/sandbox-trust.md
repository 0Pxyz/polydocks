# User-Plugin Sandbox: Trust Tiers + Worker Direction

> **Status:** Stated model with enforcement pointers. Anything unenforced is labeled **intended**, not implied (#183).
> **Scope:** doc only. No signing infra, no review pipeline, no marketplace, no new sandbox framework.

## The two tiers

| | First-party (global) | User (generated / external) |
|---|---|---|
| Examples | search, browser, sources, sandbox contract plugins | Agent-created plugins, store installs |
| Trust (`manifest.trust`) | `core`, `first-party` | `generated`, `external` |
| Scope | global: every workspace | own workspace, own storage |
| Runtime access | privileged: host-side handlers, official events | iframe only, bridge only |
| Secrets | platform keys server-side, never to guests | none — never to model context or iframe |
| Cross-plugin reads | registry/bus as policy allows | none |
| Official writes (XP rulesets, receipts) | only emitters | never |

## Enforced boundaries (reviewer pointers)

- **Origin-isolated execution.** Guests run in `<iframe sandbox="allow-scripts" srcdoc>` with no same-origin access (`src/features/dock/DockSurface.tsx`, `src/features/dock/DynamicPluginSandbox.tsx:232`).
- **Bridge-only host contact.** The guest API is `storage.get/set/remove`, `task.start/update/done`, `openUrl`, `getContext` over `postMessage` (`src/features/dock/bridge/guest-bridge.js`, `host-bridge.ts`). A guest cannot emit `plugin.created`, touch the registry, or call capabilities directly — official events originate host-side only (`server/agent/loop.ts` emits, `server/facade/shared.ts` envelopes).
- **Capabilities execute host-side through one gate.** Every capability invocation validates policy, schema, timeout, redaction, audit, and SSE (`server/plugins/bus.ts` `invoke`), with default-deny adapter checks, grant checks, and approval for destructive/external (`server/plugins/policy.ts`, `server/plugins/approval.ts`, `executions` table).
- **Declared permissions.** Manifests declare `net / fs / exec / mcp / secret` (`server/plugins/manifest.ts`); grants are recorded per plugin and scope, visible and revocable (`server/plugins/registry.ts` `recordGrant/getGrants/revokeGrant`, `GET /api/plugins/:id/grants`, install envelope `permissions` + `permissionLines`).
- **Stated risk ladder.** `server/plugins/risk.ts` maps every capability to read/write/external/destructive with treatments; low-risk paths stay silent.
- **Agent under the same policy.** The agent holds an explicit first-party manifest and every direct tool call is gated before execution (`server/agent/manifest.ts`).

## Intended, not yet enforced

- **Signing.** No signing infrastructure exists; `trust` is a manifest claim verified at install, not a cryptographic signature. Marketplace future = user tier plus review + signature; portable manifests, versioned code, and install-time grants already exist, so the architecture does not block it.
- **Review pipeline / marketplace UI.** Explicitly out of scope.
- **Official XP ruleset location.** Intended to live in first-party plugins; no code location is designated yet.

## Worker direction (when iframe isolation is insufficient)

If a user plugin needs compute beyond the iframe (untrusted code, native deps, long jobs), execution moves to a per-user Modal sandbox as disposable compute — same model as agent execution (`docs/sandbox.md`): PolyDocks keeps agent, workspace, and permissions; Modal owns isolated compute. No `docker.sock` in the app container, no new execution providers. The bridge contract does not change: results return through the same envelopes, and policy still gates every capability the worker invokes.
