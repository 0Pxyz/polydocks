# Skill: Tabs in the Dock (create, open, patch, remove)

> A tab is a city-scoped tool under `workspace/<city>/features/<id>/`. For workspace-persistent tools see `plugins`.

## When to use

`list_tabs` only when asked what exists. `open_tab` focuses one, `open_intent` primes one. `create_tab` only for a tool to come back to.

## Tools in order

Read: `list_tabs({cityId?})`, then `open_tab({tabId, cityId?})` or `open_intent({tabId, url?, payload?})`. `inspect_tab` is debug-only. `close_tray({})` takes no id and returns to the map.
Write: `create_tab`, then `open_tab` to show it. `update_tab({id, ...})` needs a city scope or it throws. `delete_tab({id, userApproved, cityId?})` without `userApproved: true` only returns `approval_required`.

## Backend contract

`create_tab`: `id` matches `^[a-z0-9_-]+$`, `title` required, `icon` is a Lucide name (default `Layers`), exactly one of `code` (TSX) or `html` (legacy), `scope` `city` (default) or `global`. Returns `{success, tab, cityId}`; emits `tab.created`. `open_tab`/`open_intent` emit `tray.open`; `open_intent` also emits `tab.prime` and persists intent state. `update_tab` returns `tab.updated`; `delete_tab` returns `tab.deleted`.

## Sandbox, bridge, code rules

Sandbox is `allow-scripts` (origin-isolated) with a real Content-Security-Policy (`script-src`/`style-src 'unsafe-inline'`, no external sources). Host API is `window.polymax` (`window.polydocks` alias): `storage.get/set/remove`, `invoke`/`useCapability`, `openUrl`, `openContent` (native Reader), `getContext`, `submit`, `ui.expand/collapse`, `task.start/update/done`. TSX stays one file with the shadcn import allowlist and under 512KB; mount `#app`. Shadcn-first, dark tokens, one accent `#C8FF57`, no gradients, no emoji, no dividers. Code persists in SQLite `plugin_files`.

## Lifecycle (host owns mount/hide/hibernate — read docs/plugins/lifecycle.md first)

State in `polymax.storage`, work in `polymax.task`; FORBIDDEN: `location.reload()`, active-tab rendering, active-derived keys (see docs/plugins/lifecycle.md).

## Common mistakes

`open_tab` with an id never created; `update_tab`/`delete_tab` with no city scope; `delete_tab` without approval; `html` with external scripts; a second `create_tab` instead of `update_tab`.

## Example

"Rename the flashcards tab": confirm the id with `list_tabs()`, then `update_tab({id, title})`.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/create_tab.ts, server/agent/tools/update_tab.ts,
server/agent/tools/delete_tab.ts, server/agent/tools/list_tabs.ts,
server/agent/tools/open_tab.ts, server/agent/tools/open_intent.ts,
server/agent/tools/inspect_tab.ts, server/agent/tools/close_tray.ts,
server/workspace/features.ts, server/workspace/reactKit.ts,
src/features/dock/bridge/guest-bridge.js, docs/design-slop.md, docs/plugins/lifecycle.md
-->
