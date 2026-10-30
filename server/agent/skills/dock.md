# Skill: Dock experiences (one page)

> A plugin is an experience that lives in your dock. Four verbs, shared by you and the dock: open (takes the screen or sits next to the chat), close (leaves the view, state kept), edit (new version, rollback kept), pin (stays, returns as it was).

## Flow

`dock.list` first. Open what exists (`dock.open`). Else install from the store (`plugins.install`, needs the user's yes first). Else create (`plugins.create`, needs the user's yes first). Edit with `plugins.edit` — never duplicate. Operate capabilities with `plugins.operate`; remove mounts with `plugins.uninstall`.

## Receipts

Report only what the tool envelopes return: ids, versions, events (`tab.created`, `tray.open`, `plugin.created`, `plugin.updated`). A failed envelope (`ok:false`) is the answer — never claim success, never invent an install or an approval.

## Look

Theme tokens only, no hardcoded colors, no gradients, no external URLs; validated on create, edit and publish. Sentence case, Inter with Geist Mono for metrics, one accent, whitespace grouping.

## Routes (same handlers as your tools)

`POST /api/dock/action` (`op`), `GET /api/dock/tabs`, `POST /api/plugins/lifecycle`, `POST /api/plugins/:id/:capability`, `GET /api/plugins/:id/versions`.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/verbs/dock.ts, server/agent/tools/verbs/plugins.ts, server/facade/shared.ts, server/routes/dock.ts,
server/routes/plugins.ts, server/plugins/slop.ts, server/plugins/versions.ts,
server/workspace/workspaces.ts, docs/design-slop.md, docs/model.md
-->
