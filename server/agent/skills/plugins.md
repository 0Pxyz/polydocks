# Skill: Plugins

> A workspace-persistent tool. Never recreate to fix.

## Backend contract

`create_plugin`: `id` `^[a-z0-9_-]+$`, `name` `description` `code`; icon via `search_icons`; `workspaceId?` `idempotencyKey?` `capabilities?`. Duplicates refused; emits `plugin.created`; `verifyPluginState` gates.
`modify_plugin`: `id` `changeSummary` + `patch`/`code`/metadata. Bumps version, keeps keys; emits `plugin.updated`.
`inspect_experience({id, workspaceId?})`: `experience_errors` (last 10), health; inspect before fixing.
`operate_plugin`: declared capability only. `publish_plugin`/`promote_to_plugin` emit published.

## Design system (kit v2 — choose, never recreate)

Per request: `ui_catalog` → index → fichas needed → compose.
Imports: `@/components/ui/kit` (Stack Inline Grid Panel Section Scroll;
Heading Text Caption Mono Metric; Button IconButton Link; TextField
SearchField TextAreaField Select Checkbox Switch SegmentedControl; List
ListRow Card Avatar ProgressBar Spinner; EmptyState InlineMessage Dialog
Tooltip Skeleton) + patterns (ListWithSearch ListDetail MetricsPanel
FormPanel ReaderFeed NotesEditor SettingsForm SingleAction StateScreen)
+ L2 (AreaChart Bars Countdown DateField MarkdownView CodeBlock).

One primary action; rows wholly clickable (44px); read state by
dot/weight; no badges/tags, italic, serif, separators, bordered boxes,
tool ids; human errors. Tokens only — no hex, `style=`, or custom CSS
where a part exists. Gate rejects raw `<button>/<input>/<select>/
<textarea>`, hex, inline style (fix and retry, max 2).

## Code, storage, verification

One TSX file; imports `react`, `react-dom/client`, `@/components/ui/*`; mount `#app`. Bridge `window.polymax`: `storage`, `invoke`/`useCapability`, `openContent`, `task`, `theme.get`; sandboxed.

## Host-owned lifecycle (read docs/plugins/lifecycle.md first)

State in `polymax.storage`, work in `polymax.task`; FORBIDDEN: `location.reload()`, active-tab rendering, active-derived keys.

## Common mistakes

`create_plugin` for a fix; `modify_plugin` without inspecting; `operate_plugin` undeclared; clearing stored keys; raw `<button>` not kit `Button`; no early success claims.
Mounting unregistered UI: every agent-built tool ships as a registered plugin via `create_plugin` (registry + verify + dock mount). Never render hardcoded tool screens in core surfaces and never mount ad-hoc tabs.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/create_plugin.ts, server/agent/tools/modify_plugin.ts,
server/agent/tools/inspect_experience.ts, server/agent/tools/operate_plugin.ts,
server/agent/tools/publish_plugin.ts, server/agent/tools/promote_to_plugin.ts,
server/services/pluginService.ts, server/plugins/registry.ts,
server/plugins/bus.ts, server/plugins/verify.ts, server/plugins/versions.ts,
server/workspace/pluginFiles.ts, server/workspace/experienceErrors.ts, docs/design-slop.md, docs/plugins/lifecycle.md
-->
