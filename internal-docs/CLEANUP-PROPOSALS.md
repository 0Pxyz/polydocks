# Cleanup Proposals (NOT executed — approval required per item)

> Nothing below has been deleted. Each item needs an explicit ok before execution. Code and docs are untouched on this branch; only the six proposal files are new/rewritten.

## A. Documentation files

| File | Problem (evidence) | Proposal |
|---|---|---|
| `docs/architecture.md` | superseded reference, contradicting the target | DONE: file removed; history on `future/city-experience` |
| `docs/product-philosophy.md` §6 | outdated confinement framing | DONE: reframed to active workspace / plugin data dir |
| `AGENTS.md` (old, on `main`) | Cited `src/features/tabs/registerTab` (never existed), `skills/create-tab.md` (never existed), `docs/product.md|demo.md|credits.md` (never existed), Biome/Vitest (actually oxlint + `bun test`), per-launch token (no token code exists) | Rewritten on this branch |
| `README.md` (old, on `main`) | Referenced `docs/assets/polymax-hero.png|polymax-dock.png|polymax-demo.gif` (only `plugin-store-redesign.png` exists in `docs/assets/`) | Rewritten on this branch; demo media stays pending work, not a blocker |
| `docs/api.md`, `docs/model.md`, `docs/dock-shortcuts.md`, `docs/plugins/lifecycle.md`, `docs/meta-model-api.md`, `docs/tinyfish.md`, `docs/system-access.md`, `docs/design-system.md`, `docs/design-slop.md` | Verified accurate against code where checked (MCP tools `server/api/mcp.ts:13-60`, `skill.triggers` `server/plugins/manifest.ts:106`, shortcuts registry) | Keep, no action |
| `docs/maps.md`, `ascii-world-engine.md`, `particle-world-engine.md`, `voice-realtime.md`, `agentic-runtime-guide.md`, `polydocks-demo.md`, `assets-licenses.md` | Not re-verified in this pass | Keep; verify-or-flag in a follow-up docs pass |
| `NEW_WORK.md`, `CLAUDE.md` (root) | Overlap with `AGENTS.md`/`MIGRATION.md` suspected, not yet audited | Propose: audit, then merge into `MIGRATION.md` or delete — needs ok |

## B. Branches with unique work (from Phase 2 investigation)

| Branch | Unique content | Proposal |
|---|---|---|
| `feat/polydocks-home` (3) | Home iteration predating #161 (`bb577cb` claims supersede of #159/#160) | File-level diff vs current home, then delete — needs ok after diff |
| `feat/source-open-rework` (7, 998+) | Sources opening rework; no files unknown to `main`, overlaps merged Sources work | Diff file-by-file, salvage tests/smokes if valuable, then delete — needs ok |
| `feat/contract-sources-v2` + `feat/plugin-contract-sources` | Contract iterations overlapping `04e5005` and `archive/stash-1-contract-session-20261029` (contract test 231 vs 221 lines) | Compare against archive branch, keep winner, delete losers — needs ok |
| `feat/dock-icons-chat-polish` (12, 6860+) | Based on `72b9e5d` (pre-#31 era); almost certainly stale | Rebase spike to evaluate; almost certainly delete — needs ok |
| Remote `origin/feat/slop-pins-rollback`, `install-policy-receipts`, `product-verbs-model` | Pre-merge copies of the #150–152 stack (already on `main` via `3228745`) | Verify diff empty-ish, then delete remotes — needs ok |
| `origin/feat/agent-progress-heartbeat` | 0 unique vs `main` | Safe to delete remote — needs ok |

## C. Code (proposals only — no application code touched in this phase)

| Item | Evidence | Proposal (later phase, needs ok) |
|---|---|---|
| Orphan `dock_items` table (live DB, zero references) | Phase 0/1 audits | Decide single source of truth, then drop or adopt — needs ok |
| Triple source store | `MIGRATION.md` Slice 3 | DONE: unified `sources` keyed by workspace; dead tables dropped with migration |
| Hardcoded knowledge-map routes/views/tools/front | `ARCHITECTURE.md` §1 + §3 Gap 2 | DONE: removed to the parked experience branch |
| `MCP_TOKEN` missing from `.env.example` | Referenced in code, absent in example env | One-line follow-up — low risk, needs ok |

## D. Stashes and backups (already preserved, Phase 2)

All 10 stashes intact; archive branches `archive/stash-0-*`, `archive/stash-1-*`, `archive/stash-5-*` pushed; patches + untracked exports in `~/Work/backups/stash-patches-20261030/`. No drops proposed in this phase.
