# Skill: Plugins

> A workspace-persistent tool. Never recreate to fix. For city tabs see `dock-and-tabs`.

## Backend contract

`create_plugin`: `id` `^[a-z0-9_-]+$`, `name` `description` `code`; icon via `search_icons` (default `cards`); `workspaceId?` `idempotencyKey?` `capabilities?`. Emits `plugin.created`; duplicates refused; `verifyPluginState` gates.
`modify_plugin`: `id` `changeSummary` + `patch {find, replace}`, full `code`, or metadata. Bumps version, keeps stored keys, emits `plugin.updated`.
`inspect_experience({id, cityId?})`: `{success, errors (last 10), isHealthy, verification}` or not-found; history in `experience_errors`; inspect before fixing.
`operate_plugin({pluginId, action, ...})`: declared capability or fails; emits `plugin.operated`. `publish_plugin` / `promote_to_plugin` emit `plugin.published`.

## Design system (native by default, docs/design-slop.md)

Kit first, raw controls last; custom layouts welcome. Tokens
(auto-theme): `background foreground card secondary muted muted-foreground
primary accent border input ring popover destructive radius`. Sentence case, two levels max. Every control: hover, active, focus ring, disabled,
loading. Banned: hex, gradients, glows, external sources, decorative pills,
borders, separators. Actions: `Button` (outline/ghost quiet, size icon).
Type: 15px semibold, 13px, xs muted, mono tabular numbers. Live: `Badge` or
dot + label. Group: `bg-card` step, whitespace. Select: `Tabs`. Load/empty:
`Skeleton`, truth + one action. Input: `Input` `Textarea`. Help: `Tooltip`.
Plain script: `.px-btn` `.px-text` `.px-badge` `.px-group`
`.px-tabs` `.px-input` `.px-skeleton` `.px-empty`, `data-px-tip`. Icons: catalog ids, no emoji.

## Code, storage, verification

One TSX file, SQLite `plugin_files`; imports `react`, `react-dom/client`, `@/components/ui/*`; mount `#app`. Bridge `window.polymax`: `storage`, `invoke`/`useCapability`, `openUrl`, `openContent`, `ui.expand/collapse`, `task`, `theme.get`; sandboxed.

## Host-owned lifecycle (read docs/plugins/lifecycle.md first)

State in `polymax.storage`, work in `polymax.task`; FORBIDDEN: `location.reload()`, active-tab rendering, active-derived keys.

## Common mistakes

`create_plugin` for a fix; `modify_plugin` without inspecting; `operate_plugin` undeclared; clearing stored keys; raw `<button>` not kit `Button`; no early success claims.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/create_plugin.ts, server/agent/tools/modify_plugin.ts,
server/agent/tools/inspect_experience.ts, server/agent/tools/operate_plugin.ts,
server/agent/tools/publish_plugin.ts, server/agent/tools/promote_to_plugin.ts,
server/services/pluginService.ts, server/plugins/registry.ts,
server/plugins/bus.ts, server/plugins/verify.ts, server/plugins/versions.ts,
server/workspace/pluginFiles.ts, server/workspace/experienceErrors.ts, docs/design-slop.md, docs/plugins/lifecycle.md
-->
