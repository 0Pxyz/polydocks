# PolyDocks Migration: reversible slices toward the microkernel

> Rule: one slice = one PR, each mergeable and revertible on its own. Verify every slice with `bun run check`. Do not start a slice until the previous one is on `main`. Related tracking: #153 (core forgets the knowledge-map).

## Done

- [x] **Slice 0 — reconcile main/dev.** Merged dock single-source (`server/workspace/dockItems.ts`, `src/lib/dock/dockItems.ts`, rewritten `useDockStore`) with Sources + polydocks-first home + TinyFish branding. Result: `main` = `dev` = `21f2494`, suite 796 pass / 1 skip / 0 fail.

## Next slices (in order)

- [ ] **Slice 1 — `plugins.install` on the full surface.** Expose the existing minimal verb (`server/agent/tools/verbs/plugins.ts:53-65`) in `fullToolsList` (`server/agent/tools/index.ts:123`) behind the same `userApproved` gate (`server/agent/installPolicy.ts:27-34`). Revert: one-line removal. Verify: `bun test tests/agent-intent-driven.test.ts` + new case asserting `approval_required` without approval, success with it.
- [x] **Slice 2 — knowledge-map experience removed, parked on `future/city-experience`.** No pilot extraction: the whole knowledge-map surface (routes, tools, views, tables, skills) left mainline in one reversible branch instead of being incrementally extracted.
- [x] **Slice 3 — unified `sources` keyed by workspace + server `dock_pins`.** Reads go to the unified table; dead knowledge-map tables dropped with a data-preserving boot migration. Verify: `tests/issue-165-persistence.test.ts`.
- [ ] **Slice 4 — minimum auth + per-user data.** Bearer check on all routes (MCP's `isAuthorizedMcpRequest` is the pattern), `resolveUserId` validates instead of falling back, `DATA_DIR/<userId>/` split. Document as single-user-until-then; no Modal yet. Revert: env flag off.
- [ ] **Slice 5 — Modal spike (behind flag).** One function, one volume: create/destroy per-user sandbox reusing the Docker image. No loop changes. Revert: flag off, local path unchanged.

## Explicitly deferred

- Agent-as-plugin, map/chat extraction, remote store with review/signing, voice/segmentation wiring, deleting any documentation or application code (see `CLEANUP-PROPOSALS.md` — proposals only, execution needs approval).
