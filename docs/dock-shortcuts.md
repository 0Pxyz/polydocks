# Dock shortcuts (single action registry)

One place defines action, shortcut and description:
`src/lib/dock/dockItems.ts` (`DOCK_ACTIONS`, server mirror in
`server/workspace/dockItems.ts`). Keyboard, `POST /api/dock/action`,
`bin/polydocks dock …` and the agent verbs (`dock.focus/next/prev/background`,
`chat.toggle`) all run through these ids, so the same input gives the same
final state and the same events (`tests/dock-equivalence.test.ts`).

Shortcuts use `event.code`, never `event.key` (Shift+1 yields `!` on US and
differs on PT layouts; `Digit1` is stable). Mac: Cmd counts as Ctrl.

| Action | Shortcut | Fallback | Description |
| :--- | :--- | :--- | :--- |
| `tabs.focus {index}` | Ctrl+Shift+1…9 | Alt+1…9 | Focus the nth open item in visual order |
| `tabs.next` | Ctrl+Shift+→ | Alt+→ | Next item |
| `tabs.prev` | Ctrl+Shift+← | Alt+← | Previous item |
| `tabs.close` | Ctrl+Shift+W | Alt+W | Close the focused item (one click; state kept) |
| `tabs.background` | Ctrl+Shift+H | Alt+H | Move focused to background (keeps running) |
| `chat.toggle` | Ctrl+Shift+0 | Alt+0 | Focus/toggle chat |

Known conflicts: browsers and the OS reserve some Ctrl+Shift+letter combos
(tab restore, devtools, input methods). When a combo is taken, use the Alt
fallback — it runs the same action. `⌘K` stays reserved for agent
conversation discovery; `Ctrl/Cmd+Shift+P` toggles dock search.

Focus is visible (`focus-visible` outline in `--accent-lime`) and tab order
follows the visual bar order. The shortcut number shows only on hover/focus
tooltips, never as permanent chrome.
