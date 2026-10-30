# Skill: Plugins (persistent tools: create, patch, run, share)

> A plugin is a workspace-persistent tool. Fixes go `inspect_experience` first, then `modify_plugin`; Never recreate to fix. For city tabs see `dock-and-tabs`.

## Lifecycle

`inspect_experience` (source, version, mounts, experience_errors), then `create_plugin` or `modify_plugin`, then `operate_plugin`, then `promote_to_plugin` or `publish_plugin`.

## Backend contract

`create_plugin`: `id` matches `^[a-z0-9_-]+$`; `name`, `description`, `code` required; `icon` is a catalog id (default `cards`; use `search_icons`, unknown ids rejected); plus `workspaceId?`, `idempotencyKey?`, `capabilities?`. Returns `{success, pluginId, version}`; success emits `plugin.created`. Duplicate ids refused; `verifyPluginState` must pass.
`modify_plugin`: `id`, `changeSummary` required plus `patch {find, replace}`, full `code`, or metadata fields. Bumps version (history kept), preserves stored keys, emits `plugin.updated`.
`inspect_experience({id, cityId?})`: `{success, errors (last 10), isHealthy, verification}` or not-found. Always inspect before writing a fix.
`operate_plugin({pluginId, action, args?, workspaceId?})`: runs a declared capability; undeclared fails. Success emits `plugin.operated`. `publish_plugin`/`promote_to_plugin` emit `plugin.published`.

## Design (must look native, docs/design-slop.md)

Theme tokens only. No bordered cards, Separators, or Badge pills. Sentence case, normal tracking. Group with whitespace, not boxes.

## Code, storage, verification

One TSX file in SQLite `plugin_files`; imports allowlisted to `react`, `react-dom/client`, `@/components/ui/*`; real CSP in the srcdoc; mount `#app`. Render test blocks bad publishes (hex/slop are warnings). Bridge `window.polymax`: `storage`, `invoke`/`useCapability`, `openUrl`, `openContent` (native Reader), `ui.expand/collapse`, `task`; iframes stay `allow-scripts` isolated.

## Lifecycle (host owns mount/hide/hibernate — read docs/plugins/lifecycle.md first)

State in `polymax.storage`, work in `polymax.task`; FORBIDDEN: `location.reload()`, active-tab rendering, active-derived keys (see docs/plugins/lifecycle.md).

## Common mistakes

`create_plugin` for a fix; `modify_plugin` without inspecting; `operate_plugin` with an undeclared action; clearing storage keys in a rewrite; claiming success before the tool result or verification.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/create_plugin.ts, server/agent/tools/modify_plugin.ts,
server/agent/tools/inspect_experience.ts, server/agent/tools/operate_plugin.ts,
server/agent/tools/publish_plugin.ts, server/agent/tools/promote_to_plugin.ts,
server/services/pluginService.ts, server/plugins/registry.ts,
server/plugins/bus.ts, server/plugins/verify.ts, server/plugins/versions.ts,
server/workspace/pluginFiles.ts, server/workspace/experienceErrors.ts, docs/design-slop.md, docs/plugins/lifecycle.md
-->
