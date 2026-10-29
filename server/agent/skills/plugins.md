# Skill: Plugins (persistent tools: create, patch, run, share)

> A plugin is a workspace-persistent tool. Any fix or change to an existing one goes `inspect_experience` first, then `modify_plugin`. Never recreate to fix. For city tabs see `dock-and-tabs`.

## Lifecycle

`inspect_experience` (source, version, mounts, verification, experience_errors), then `create_plugin` or `modify_plugin` (`patch` or code), then `operate_plugin` to run an action, then `promote_to_plugin` (catalog) or `publish_plugin` (store).

## Backend contract

`create_plugin`: `id` matches `^[a-z0-9_-]+$`; `name`, `description`, `code` (min 10 chars) required; `icon` is a Phosphor name (default `Cards`); plus `workspaceId?`, `idempotencyKey?`, `capabilities?`. Result `{success, pluginId, version}` or `{success: false, error}`; success emits `plugin.created`. Exact-id duplicates are refused; `verifyPluginState` must pass.
`modify_plugin`: `id`, `changeSummary` required plus `patch {find, replace}`, full `code`, or metadata fields. Bumps version (history kept), preserves stored keys, emits `plugin.updated`.
`inspect_experience({id, cityId?})`: `{success, errors (last 10), isHealthy, verification}` or not-found error. Always call before writing a fix.
`operate_plugin({pluginId, action, args?, workspaceId?})`: runs a declared capability; undeclared actions fail listing what exists. Success emits `plugin.operated`. `publish_plugin`/`promote_to_plugin` emit `plugin.published`.

## Code, storage, verification

Code lives in SQLite `plugin_files` (source of truth; `workspace/` is a migration fallback). One TSX file: imports allowlisted to `react`, `react-dom/client`, `@/components/ui/*`; real CSP in the srcdoc; mount `#app`. A render test blocks bad publishes (hardcoded hex is a warning). Bridge is `window.polymax`: `storage`, `invoke`/`useCapability` (capability bus), `openUrl`, `openContent` (native Reader, no iframe), `getContext`, `submit`, `ui.expand/collapse`; iframes stay `allow-scripts` isolated.

## Common mistakes

`create_plugin` for a fix; `modify_plugin` without inspecting; `operate_plugin` with an undeclared action; clearing storage keys in a rewrite; claiming success before the tool result or verification.

## Example

"Add a streak counter to my timer": `inspect_experience({id})`, then `modify_plugin({id, patch, changeSummary})`, then report the version and `isHealthy`.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/create_plugin.ts, server/agent/tools/modify_plugin.ts,
server/agent/tools/inspect_experience.ts, server/agent/tools/operate_plugin.ts,
server/agent/tools/publish_plugin.ts, server/agent/tools/promote_to_plugin.ts,
server/services/pluginService.ts, server/plugins/registry.ts,
server/plugins/bus.ts, server/plugins/verify.ts, server/plugins/versions.ts,
server/workspace/pluginFiles.ts, server/workspace/experienceErrors.ts, docs/design-slop.md
-->
