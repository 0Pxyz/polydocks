# Tab lifecycle contract

One rule: **only the host mounts, hides, and hibernates tabs. Plugins never control their own lifecycle.**

Switching tabs never reloads: the host keeps every opened tab mounted and hides inactive ones with CSS, so iframes keep running and React state is untouched. Above the live limit (5 plugin tabs) the host hibernates the least recently used one; reopening remounts and restores persisted state. Explicit close destroys the runtime entry (persisted keys survive reinstall).

## For plugin authors (generated, community, first-party views)

- **Durable state** goes in `polymax.storage.get/set` (guests) or `useTabState(tabId, key, initial)` (host React). Rehydrate on boot; never keep must-survive state only in component state.
- **Background work** (streams, searches, uploads, generation) registers with `polymax.task.start({ label })`, reports `task.update(id, …)`, finishes with `task.done(id)`. It continues with the tab hidden; the host shows progress and notifies on completion. Hibernation marks running tasks `interrupted` — re-register on restore.
- **Render unconditionally.** Forbidden (validation rejects with a clear error): `location.reload()`; rendering on the active tab (`isActive`/`activeTab` conditionals, active-derived `key`s). The host hides inactive tabs — they keep running.

## Guarantees the host provides

- Open A, B, C and back to A: 0 remounts in A; `useTabState` values intact.
- A registered task completes with the tab hidden; completion is visible on return.
- Hibernation preserves persisted state; restore remounts once and resumes from it.

See `src/lib/tabs/tabHostStore.ts` (`LIVE_TAB_LIMIT`), `src/lib/tabs/useTabState.ts`, `src/features/dock/TaskNotice.tsx`, and the registry-wide contract suite `tests/tab-lifecycle-contract.test.ts`.
