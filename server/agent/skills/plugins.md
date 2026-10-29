# Skill: Plugins (persistent tools: create, patch, run, share)

> A plugin is a workspace-persistent tool. Any fix or change to an existing one goes `inspect_experience` first, then `modify_plugin`. Never recreate to fix. For city tabs see `dock-and-tabs`.

## Lifecycle

`inspect_experience` (state, errors), then `create_plugin` or `modify_plugin`, then `operate_plugin` to run an action, then `promote_to_plugin` (catalog) or `publish_plugin` (store).

## Backend contract

`create_plugin`: `id` matches `^[a-z0-9_-]+$`; `name`, `description`, `code` (min 10 chars) required; `icon` is a Phosphor name (default `Cards`); plus `workspaceId?`, `idempotencyKey?`, `capabilities?` (`{id, title, description, risk, input?}`, risk defaults `read`). Result `{success, pluginId, version}` or `{success: false, error}`; success emits `plugin.created`.
`modify_plugin`: `id`, `code`, `changeSummary` required. Bumps version, preserves stored keys, emits `plugin.updated`.
`inspect_experience({id, cityId?})`: `{success, errors (last 10), isHealthy}` or not-found error. Always call before writing a fix.
`operate_plugin({pluginId, action, args?, workspaceId?})`: runs a declared capability; undeclared actions fail listing what exists. Success emits `plugin.operated`. `publish_plugin`/`promote_to_plugin` emit `plugin.published`.

## Verified vs not

The registry validates the manifest and the TSX import allowlist (`react`, `react-dom/client`, `@/components/ui/*`); idempotency keys dedupe retries. It never runs the code: runtime failures land in `experience_errors`, read back with `inspect_experience`. Re-creating an existing id upserts over it and resets the version, so fixes belong in `modify_plugin`.

## Code rules

Same sandbox as tabs (`allow-scripts`, `window.polymax` bridge, mount `#app`, no `export`, no external imports, no `alert`). Shadcn-first, dark tokens, one accent, plain copy, every card links its real source.

## Common mistakes

`create_plugin` for a fix; `modify_plugin` without inspecting; `operate_plugin` with an undeclared action; clearing storage keys in a rewrite; claiming success before the tool result.

## Example

"Add a streak counter to my timer": `inspect_experience({id})`, then `modify_plugin({id, code, changeSummary})`, then report the version and `isHealthy`.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/create_plugin.ts, server/agent/tools/modify_plugin.ts,
server/agent/tools/inspect_experience.ts, server/agent/tools/operate_plugin.ts,
server/agent/tools/publish_plugin.ts, server/agent/tools/promote_to_plugin.ts,
server/services/pluginService.ts, server/plugins/registry.ts,
server/plugins/bus.ts, server/workspace/experienceErrors.ts,
server/workspace/reactKit.ts, docs/design-slop.md
-->
