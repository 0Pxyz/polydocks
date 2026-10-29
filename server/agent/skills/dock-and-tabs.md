# Skill: Tabs in the Dock (create, open, patch, remove)

> A tab is a city-scoped tool under `workspace/<city>/features/<id>/`. For workspace-persistent tools see `plugins`.

## When to use

`list_tabs` only when asked what exists. `open_tab` focuses one, `open_intent` primes one with `url`/`payload`. `create_tab` only for a tool to come back to. Never open everything, never rebuild what `update_tab` can patch.

## Tools in order

Read: `list_tabs({cityId?})`, then `open_tab({tabId, cityId?})` or `open_intent({tabId, url?, payload?})`. `inspect_tab` is debug-only. `close_tray({})` takes no id and returns to the map.
Write: `create_tab`, then `open_tab` to show it. `update_tab({id, ...})` needs a city scope or it throws. `delete_tab({id, userApproved, cityId?})` without `userApproved: true` only returns `approval_required`.

## Backend contract

`create_tab`: `id` matches `^[a-z0-9_-]+$`, `title` required, `icon` is a Lucide name (default `Layers`), exactly one of `code` (TSX) or `html` (legacy document), `scope` `city` (default) or `global`. Result `{success, tab, cityId, action: "tab.created"}`; the loop emits `tab.created`. `open_tab`/`open_intent` emit `tray.open`; `open_intent` also emits `tab.prime`, persists `activeTab`/`lastIntent`/`currentURL`/`openSources` to `workspace.json`, and audit-logs. `update_tab` returns `tab.updated` (no event); `delete_tab` returns `tab.deleted` (no event).

## Sandbox, bridge, code rules

Sandbox is `allow-scripts` with no CSP header; keep documents self-contained. Host API is `window.polymax` (`window.polydocks` is the same object): `storage.get/set/remove`, `invoke`, `openUrl`, `getContext`, `submit`, `ui.expand/collapse`. No `openContent` or `useCapability` on this backend. TSX must be import-free (any `import` throws a Security Violation) and under 512KB; mount into `#app`. Shadcn-first, dark tokens, one accent `#C8FF57`, no gradients, no emoji, no dividers.

## Common mistakes

`open_tab` with an id never created; `update_tab`/`delete_tab` with no city scope; `delete_tab` without approval; `html` with external scripts; a second `create_tab` instead of `update_tab`.

## Example

"Rename the flashcards tab": `list_tabs()` to confirm the id, `update_tab({id, title})`, report the manifest title. "What tabs" is `list_tabs()` alone.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/create_tab.ts, server/agent/tools/update_tab.ts,
server/agent/tools/delete_tab.ts, server/agent/tools/list_tabs.ts,
server/agent/tools/open_tab.ts, server/agent/tools/open_intent.ts,
server/agent/tools/inspect_tab.ts, server/agent/tools/close_tray.ts,
server/workspace/features.ts,
src/features/dock/bridge/guest-bridge.js, docs/design-slop.md
-->
