# First-Party Plugin Taxonomy Audit

Date: 2026-11-03. Scope: first-party/built-in plugins only (generated
workspace plugins like `box-breathing` are user artifacts, not taxonomy).
Evidence: live registry (`server/plugins/first-party/index.ts`,
`server/plugins/registry.ts`), surfaces (`src/features/dock/ToolSurface.tsx`),
dock catalog (`src/lib/dock/dockModel.ts`, `server/agent/tools/dockCatalog.ts`).

## Target taxonomy (six capabilities)

Tasks · Notes · Files · Research · Code/Terminal · Plugin Store.

## Audit findings

| Plugin | Trust | Role | Maturity | Agent integration | State completeness | Verdict |
|---|---|---|---|---|---|---|
| `browser` | core, 1 cap, 1 surface | Interactive user tool | High: tab dedup, blocked-frame fallback card, Reader fallback (`NativeBrowserView.tsx`, `browserTabs.ts`) | Full: `browser.open` / `open_source`, dock verbs | Loading/error/empty states, persisted tabs | **Keep (default dock)** |
| `notes` | core, 5 caps, 0 surfaces | Interactive user tool | High: list rail, debounced autosave, tab-state selection (`NotesView.tsx`) | Full: add/get/list/append/update via bus + HTTP | Loading/error/empty states, SQLite durability | **Keep (default dock)** |
| `sources` (+`search`) | core/first-party, 5 caps total, 0 surfaces | Backend capability + feed surface inside Browser | High: enrich/dedupe, kind tags, primary-first rank, live `source.added` (`SourcesView.tsx`, `sourceQuality.ts`) | Full: search/fetch/add/list/open | Loading/error/empty states, SQLite durability | **Keep (feed lives in Browser; no separate pin)** |
| `sandbox` | core, 8 caps, 0 surfaces | Infrastructure for Code/Terminal | Medium: Modal sandboxes, previews; no dedicated terminal surface | Full: serve/exec via bus | Execution audit, no persistent terminal UI | **Keep as internal capability; terminal surface is a gap (see roadmap)** |
| `files` | core, 5 caps, 0 surfaces | Infrastructure for Files | Medium: read/write/edit/search work; no file-tree surface | Full: bus + agent file tools | No loading/empty states (no surface) | **Keep as internal capability; file-tree surface is a gap** |
| `onboarding` | first-party, 4 caps, 1 surface | Demo artifact (7-act tour) | High for its job: choreography, takeover-pause, no unmapped targets | Programmatic: start/step/skip/replay | Completed-flag persistence, error boundary | **Keep (first-run only, never a default pin)** |
| `store` (`plugins`/`creations` views) | builtin views | Interactive user tool | High: install/configure/update flows | Via install/publish/operate tools | Loading/error states | **Keep (default dock)** |
| `kit-gallery` | core, 0 caps | Internal design system | N/A (dev gallery) | None | N/A | **Internal capability (not a dock item)** |
| `inspect` | first-party, 0 caps, 1 surface | Dev-only runtime inspector | Dev-only by build flag (#181, #319) | None | Explicit non-dev message | **System page (dev only)** |

No first-party plugin scores Archive: the retired knowledge-map set
(`maps`, `quests`, `terminal`, `papers`, `flashcards`) already left the
codebase (`RETIRED_PIN_IDS`, parked on `future/city-experience`).

## Recommendations matrix

- **Keep (default dock):** browser, notes, store/library, agent/chat.
- **Keep (surface without pin):** sources feed (inside Browser), onboarding (first-run tab).
- **Keep (internal capability, no surface):** search/fetch, files, sandbox, kit-gallery.
- **Consolidate:** none required — `plugins` vs `creations` views share one
  surface file with tab state, not two plugins.
- **Archive/Prune:** nothing pending; revisit after the demo.

## Roadmap: dock ↔ six capabilities

| Capability | Today | Gap to close |
|---|---|---|
| Tasks | Agent chat + background task cards; no dedicated surface | Low priority: chat carries it on camera |
| Notes | `NotesView` in main/beside hosts | Done (#351) |
| Files | Bus capabilities only, no tree surface | Post-demo: read-only tree view reusing `files.*` |
| Research | Browser + live sources feed | Done (#350, #352) |
| Code/Terminal | Sandbox previews, no terminal surface | Post-demo: terminal panel on sandbox infrastructure |
| Plugin Store | Library view + install flows | Done; remote store stays target |

Principle applied throughout: not everything built as a plugin appears
on the dock — capabilities without a user-facing job stay on the bus.
