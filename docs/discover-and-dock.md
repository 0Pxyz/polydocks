# Core dock and Discover

Product contract: a fresh workspace shows exactly three entries — **Agent**,
**Plugins**, **Settings**. Everything else is installed through Discover.
Nothing auto-installs; user data is never reset.

## Core entries (always present)

| Entry | Role |
|---|---|
| Agent | The central intelligence. Operates across the workspace through real tools; never mocked. |
| Plugins | Installed plugins (Installed tab) + the Discover catalog (Discover tab). |
| Settings | Application and workspace configuration (theme included). |

Defaults: `DEFAULT_PINNED_IDS = ["agent", "plugins", "settings"]`
(`src/lib/dock/dockModel.ts`). The agent entry is the only system entry
(`SYSTEM_TOOL_IDS = {"agent"}`): it cannot be unpinned or closed, but it is
always reachable. Existing workspaces keep their pins — only fresh layouts
get the new defaults (`migratePinnedIds` only drops the removed `store`
entry).

## Discover (inside Plugins → Discover)

One catalog, two groups, all backed by real endpoints:

1. **Registry plugins** (`GET /api/registry`, install via
   `POST /api/registry/:id/install`): community and agent-published tools.
   Install mounts into the workspace (`addPluginToWorkspace`) and the
   experience appears in the dock; uninstall removes the mount without
   touching registry data or other workspaces. Reinstall is idempotent.
   Today: `pomodoro-focus` (working, self-contained). Agent-published tools
   appear here after `publish_plugin`.
2. **Built-in experiences** with honest availability:
   - **Polymax** (world map): working standalone experience. Install pins
     `maps` through the persisted dock API (`POST /api/dock/action`
     `tabs.pin` → `dock_pins`); uninstall unpins cleanly. Never installed
     by default.
   - **Notes, Sources, Files, Quests, Flashcards, Terminal**: city-context
     experiences. They work inside cities and are labeled "In cities" —
     no fake install button, since a global install has no meaning.
   - Anything without an implementation (e.g. Concept Matrix) is **not
     listed**. Incomplete work is never presented as functional.

## No mocks in product flows

- Web search/fetch failures throw typed `TinyFishError` (no fabricated
  `example.com` sources, nothing fake cached). Callers surface the error.
- Files view shows an explicit load error with retry — never fake content.
- Terminal is a local inspector: `status`/`ls` report real state via the
  cities API; anything else is honestly answered as not connected (ask the
  Agent, which executes through real tools).
- MCP connect surfaces discovery failure as a warning instead of a silent
  generic adapter.
- The agent loop's exhausted-run fallback is a generic status message, not
  fabricated data.

## Lifecycle (all real backend)

Discover → inspect → install → dock → open/use → persist → disable/uninstall
→ reinstall. Registry, workspace mounts, `dock_pins`, versions/rollback and
the install policy are shared by UI, agent tools, CLI and REST (facade).
The agent manages plugins through `create/modify/operate/publish/install`
capabilities with the same approval gates as every other surface.

## Tests

`tests/product-simplification.test.ts`: fresh defaults, pin preservation,
real catalog contents, install→mount→uninstall→reinstall cycle, persisted
Polymax pin/unpin, search-failure honesty. Fixtures use `test-*`
workspaces/ids and clean up after themselves.
