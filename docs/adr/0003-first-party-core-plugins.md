# ADR 0003: First-Party Core Plugin Suite

- **Status:** Proposed
- **Date:** 2026-11-01
- **Authors:** Polymax team
- **Issue:** #247

## 1. Context

#247 asks for an official Core Plugin Suite: Browser, Notes, Files, Sandbox, Research. The verified
inventory (2026-11-01, against `dev`) differs from the issue text in two places:

- `cities`, `writing`, and `workspace` plugins named in the issue **do not exist in code**. No
  manifests, no registrations, no routes. The stale names likely predate the registry. Nothing to
  migrate or delete for them.
- **Notes and Files do not exist as plugins.** File access lives in native agent tools
  (`list_files`, `read_file`, `write_file`, `edit_file`, `search_files` over agent-home via
  `server/system/filesystem.ts`). There is no notes store at all; the closest structures are the
  `sources` feed (saved URLs: add/list/open) and agent memory (`record_memory`).

What ships today (all `trust: "first-party"`, registered in
`server/plugins/first-party/index.ts` or via contract):

| Plugin | Capabilities | Notes |
|---|---|---|
| `search` | `search.web`, `search.fetch` (TinyFish) | This is the Research plugin |
| `browser` | `browser.open` (+ `browser` dock surface) | Real Chromium via Atrium |
| `sources` | `sources.add/list/open` (contract) | Saved-URL knowledge feed |
| `sandbox` | `sandbox.exec/write/read/list/serve/logs/status/terminate` (contract) | Modal execution |
| `onboarding` | `onboarding.start/step/skip/replay` | First-launch lifecycle |

The `trust` enum in `server/plugins/manifest.ts` already has a `"core"` variant, and
`PluginsView.tsx` already sections it as "Built-in" — but no plugin uses it. Per #247 §5, core
plugins must differ from user plugins **without a second architecture**: the `trust` flag plus the
contract path (`defineCapability`, one definition generating bus + route + CLI) is that mechanism.
Nothing new is needed.

## 2. Decision

Target suite: **Browser, Research, Files, Sandbox, Notes** as `trust: "core"`, plus:

- `sources` stays first-party (not core): it is the saved-URL feed underlying research, agent-only,
  no dock surface. No rename, no merge — deletion/merging would break the research flow for zero gain.
- `onboarding` stays first-party with its dedicated first-launch lifecycle (never a normal dock
  plugin), per #247 §4.
- `search` keeps its id (bus ids, skills, and tools reference `search.*`); it is documented as the
  Research plugin. Renaming ids breaks callers for a label.
- Files and Notes are new thin contract plugins reusing existing executors, not new subsystems:
  Files wraps `server/system/filesystem.ts` (same traversal guards, same agent-home root); Notes is
  a workspace-scoped SQLite table mirroring the `sources` schema pattern.
- No dock surfaces for Files/Notes in slice 1 (agent-operated, like sources). Dock presence is a
  separate product decision with UI work attached.

## 3. Migration map

| Current | Proposed | Action |
|---|---|---|
| `search` | Core Research | Flip `trust` to `"core"`, document |
| `browser` | Core Browser | Flip `trust` to `"core"` (surface unchanged) |
| `sandbox` | Core Sandbox | Flip `trust` to `"core"` |
| (agent file tools) | Core Files | New `server/plugins/files.ts` wrapping `system/filesystem` |
| (nothing) | Core Notes | New `server/plugins/notes.ts`, workspace-scoped table |
| `sources` | First-party (unchanged) | Keep; feeds research |
| `onboarding` | First-party, special lifecycle | Keep; not a dock plugin |
| `cities`/`writing`/`workspace` | — | Do not exist; no action |

## 4. Consequences

- `PluginsView` shows a "Built-in" section once the flips land; no UI code changes needed.
- Contract plugins get bus + HTTP + CLI for free; agent file/notes access becomes discoverable via
  `find_capabilities`/`tool_search` instead of hidden native tools.
- Risk: the new Files capabilities duplicate the agent file tools' surface (same executors, bus
  policy re-checked at invoke). Acceptable: one shared executor, two entries — not two
  implementations. If duplication confuses routing, the follow-up is to point the agent tools at
  the bus, not to fork logic.
