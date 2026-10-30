# PolyDocks Migration: reversible slices toward the microkernel

> Rule: one slice = one PR, each mergeable and revertible on its own. Verify every slice with `bun run check`. Do not start a slice until the previous one is on `main`. Related tracking: #153 (core forgets cities).

## Done

- [x] **Slice 0 — reconcile main/dev.** Merged dock single-source (`server/workspace/dockItems.ts`, `src/lib/dock/dockItems.ts`, rewritten `useDockStore`) with Sources + polydocks-first home + TinyFish branding. Result: `main` = `dev` = `21f2494`, suite 796 pass / 1 skip / 0 fail.

## Next slices (in order)

- [ ] **Slice 1 — `plugins.install` on the full surface.** Expose the existing minimal verb (`server/agent/tools/verbs/plugins.ts:53-65`) in `fullToolsList` (`server/agent/tools/index.ts:123`) behind the same `userApproved` gate (`server/agent/installPolicy.ts:27-34`). Revert: one-line removal. Verify: `bun test tests/agent-intent-driven.test.ts` + new case asserting `approval_required` without approval, success with it.
- [ ] **Slice 2 — extract one city view (pilot).** Candidate: Flashcards or Sources. Move from direct import in `CityWorkspace.tsx` to manifest + `registerSourcesPlugin` pattern (`server/plugins/first-party/index.ts:205-206`) + existing `/srcdoc` route. Keep the migration shim (`src/App.tsx:68-84`) as the precedent; the view stays reachable while core stops importing it. Revert: restore the import.
- [ ] **Slice 3 — unify reads onto `sources` + server `dock_pins`.** Migrate read paths off `city_sources`/`feed.json` and client-only pins; keep legacy writers untouched until reads are green. Revert: flip reads back. Verify: `tests/sources-plugin.test.ts` + row-count parity script.
- [ ] **Slice 4 — minimum auth + per-user data.** Bearer check on all routes (MCP's `isAuthorizedMcpRequest` is the pattern), `resolveUserId` validates instead of falling back, `DATA_DIR/<userId>/` split. Document as single-user-until-then; no Modal yet. Revert: env flag off.
- [ ] **Slice 5 — Modal spike (behind flag).** One function, one volume: create/destroy per-user sandbox reusing the Docker image. No loop changes. Revert: flag off, local path unchanged.

## Explicitly deferred

- Agent-as-plugin, map/chat extraction, remote store with review/signing, voice/segmentation wiring, deleting any documentation or application code (see `CLEANUP-PROPOSALS.md` — proposals only, execution needs approval).
