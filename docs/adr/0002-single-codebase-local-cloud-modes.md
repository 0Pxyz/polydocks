# ADR 0002: One Codebase, Demo-First Local, Cloud as Post-Demo Fork

- **Status:** Accepted (simplified 2026-10-31: demo stays local, cloud deferred to fork)
- **Date:** 2026-10-31
- **Authors:** Polymax team
- **Context:** PolyDocks ships today as a single-user local runtime (`README.md`, `ARCHITECTURE.md`, `MIGRATION.md` Slice 4). The question was one codebase with `DEPLOY_MODE` vs a cloud fork. Decision after review: do not complicate the demo. Keep `dev`/`main` demo-clean; do cloud as a fork/branch after the hackathon unless a slice clearly helps judges.

---

## 1. Context and Problem Statement

Today the server self-asserts identity (`server/identity.ts`), uses one SQLite file (`server/workspace/db.ts`), binds via compose to `127.0.0.1:3000` without a code-level guard (`docker-compose.yml`), and documents "do not expose beyond localhost" as prose (`README.md`). Any cloud offering needs auth, per-user isolation, quotas, remote sandboxes, and SSRF hardening — without diverging into a second codebase.

## 2. Decision Drivers

- Single code path for both modes; the mode only changes who the user is and where the sandbox runs.
- Local must stay zero-setup and unchanged in behavior.
- Cloud must be secure by default: real auth, isolation tests, quotas, SSRF guards.
- Reversible slices, each mergeable on its own (`MIGRATION.md` rule).

## 3. Considered Options

1. **Cloud fork/branch after the demo (selected for now).**
   - Keep `dev`/`main` as the single-user local demo. After the hackathon, fork (or cut a `cloud` branch) for auth + per-user + billing work.
   - *Pros:* demo does not break, no half-done auth in front of judges, small team stays fast.
   - *Cons:* temporary divergence; must cherry-pick demo fixes into the fork for a short window.
2. **One codebase, `DEPLOY_MODE=local|cloud` now.**
   - *Cons for this week:* touches identity, every query, sandbox, worker, and deploy at once — too much for demo week. Keep the design, defer the switch.
3. **Framework-managed multi-tenancy now.**
   - *Cons:* too much machinery; deferred.

## 4. Decision Outcome

Demo-first, no architecture break:

- **Demo (`dev`/`main`) stays single-user local.** Zero behavior change. The only cloud-ready work allowed pre-demo is small, judge-visible hardening that cannot break the demo.
- **Cloud happens post-demo in a fork/`cloud` branch.** That is where `DEPLOY_MODE=local|cloud`, Better Auth, per-user filters, quotas, and Litestream land.
- **Simplified cloud model (no over-engineering):** auth + DB knows `user_id` + one Modal sandbox per user/workspace. That is it. The agent loop, plugins, and code run against that sandbox as today; Modal owns isolated compute, PolyDocks owns agent, workspace, and permissions (`docs/sandbox.md`). No `docker.sock` in the app container, no new execution providers, no per-call billing machine for the demo.
- **What `DEPLOY_MODE` will mean in the fork:** `local` resolves every request to the fixed `owner`; `cloud` requires a validated Better Auth session. Same code path, only the user resolution and sandbox scoping differ.
- **Auth minimal:** Better Auth with Bun `bun:sqlite` directly (no Drizzle day one). Email+password + GitHub/Google first; `organization` and `apiKey`/bearer only when sharing/CLI lands. Same-origin cookies, `trustedOrigins`, secure cookies, rate-limit on auth routes. Passkeys/2FA later.
- **Data minimal:** add `user_id`/`workspace_id` to new tables first, backfill the rest in the fork; one data layer injects the filter, no raw SQL in routes; isolation tests ("A reads nothing of B"). Opaque `contextId` stays domain-free; core only checks ownership.
- **Sandbox minimal:** keep the existing `workspace_sandboxes` 1:1 mapping; in the fork scope it by `user_id` and bind viewer/token to `userId` + `workspaceId`. Keep current limits (cpu 0.5, 512 MiB, 30 min lifetime, 10 min idle). Spend ledger extends `image_spend`, nothing fancier.
- **Browser worker minimal:** block internal networks + `169.254.169.254`, isolate from private network, validate per-user viewer tokens. Nothing else pre-demo.
- **Secrets:** encrypted at rest, never to model/iframe. Platform keys vs BYO key decided in the fork.
- **Approvals:** unchanged (`INSTALL_POLICY=ask`).

## 5. Consequences

### Positive

- Demo does not break; judges see a working local product.
- "Do not expose beyond localhost" stays true without new code paths this week.
- Fork keeps cloud work from polluting the demo; cherry-picks stay small.

### Negative / Trade-offs

- Short-term fork divergence (accepted; time-boxed until post-demo).
- Auth wiring must still be confirmed against current docs at fork time; do not guess adapter syntax (see §7).
- Per-user filters still touch many queries — that is fork work, not demo work.

## 6. Plan Without Breaking Current Architecture (demo week vs fork)

Demo week (only if judge-visible, each <400 lines, revertible):
- (a) Loopback-only guard + health reports mode. Turns the README warning into code. No auth yet.
- (b) `user_id` on new writes only (`workspace_sandboxes`, `image_spend` successors), defaulting to `owner`. Old rows untouched.
- (c) Nothing else. No Better Auth, no quotas, no Litestream in the demo path.

Fork (`cloud` branch/fork, post-demo, in order): #191 → #192 → #193 → #194 → #195.

## 7. Sources — Recommended Libs and Docs (verified 2026-10-31)

Pin versions at fork time with `bun add`; links below are the exact integration pages to follow:

- **Better Auth + Hono:** mount with `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))`; CORS with credentials on `/api/auth/*`.
  - https://better-auth.com/docs/integrations/hono
  - https://hono.dev/examples/better-auth
- **Better Auth + Bun SQLite (day one, no ORM):** `new Database("database.sqlite")` from `bun:sqlite` passed as `database`.
  - https://better-auth.com/docs/adapters/sqlite
- **Better Auth + Drizzle (only if joins/`organization` need it later):** `drizzleAdapter(db, { provider: "sqlite" })`; relations-v2 variant exists.
  - https://better-auth.com/docs/adapters/drizzle
  - Drizzle Bun:SQLite setup: https://orm.drizzle.team/docs/get-started/bun-sqlite-new
- **Better Auth `organization` plugin (workspaces/sharing, fork only):**
  - https://better-auth.com/docs/plugins/organization
- **Better Auth `apiKey` (`@better-auth/api-key`) + `bearer` (CLI/external agents, fork only):**
  - https://better-auth.com/docs/plugins/api-key
  - https://better-auth.com/docs/plugins (bearer under API & Tokens)
- **Modal Sandboxes JS SDK (`modal@^0.11.1` already in `package.json`):** `ModalClient`, `apps.fromName`, `sandboxes.create`, `volumes.fromName`, `sb.exec`, `sandbox.serve` + `tunnels()`, `sb.terminate`. Current usage is the reference (`docs/sandbox.md`, `tests/issue-166-sandbox.test.ts`).
  - https://modal.com/docs/guide/sandboxes
  - https://modal.com/docs/guide/sdk-javascript-go
  - Reference pattern only: https://modal.com/docs/examples/modal-vibe
- **Litestream (fork, sidecar binary, not npm):** `litestream replicate`, `litestream restore`, S3/R2 replica config.
  - https://litestream.io/
  - https://litestream.io/how-it-works/
  - Prod pattern: https://www.matthewswong.com/en/blog/sqlite-litestream-replication-production/

Stack already on disk: `hono@^4.13.14`, `modal@^0.11.1`, `bun:sqlite` (`server/workspace/db.ts:11-16`), `zod@^4.6.7`. New npm deps for the demo: none. For the fork: `better-auth` (+ `@better-auth/drizzle-adapter`, `drizzle-orm` only if needed).

## 8. Issues (in fork order)

1. Data layer with `user_id` + local fixed-owner mode (no behavior change for local users) — #191.
2. Better Auth + session middleware + isolation tests — #192.
3. `SandboxDriver` + quotas and spend ledger — #193.
4. Browser worker hardening (SSRF, per-user tokens) — #194.
5. Litestream backup + cloud deploy + healthchecks — #195.

Each slice is one PR (<400 lines), verified with `bun run check`.
