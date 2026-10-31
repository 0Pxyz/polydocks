# ADR 0002: One Codebase, Two Run Modes (`local` / `cloud`)

- **Status:** Accepted
- **Date:** 2026-10-31
- **Authors:** Polymax team
- **Context:** PolyDocks ships today as a single-user local runtime (`README.md`, `ARCHITECTURE.md`, `MIGRATION.md` Slice 4). The decision is how to reach per-user cloud without forking into two products.

---

## 1. Context and Problem Statement

Today the server self-asserts identity (`server/identity.ts`), uses one SQLite file (`server/workspace/db.ts`), binds via compose to `127.0.0.1:3000` without a code-level guard (`docker-compose.yml`), and documents "do not expose beyond localhost" as prose (`README.md`). Any cloud offering needs auth, per-user isolation, quotas, remote sandboxes, and SSRF hardening — without diverging into a second codebase.

## 2. Decision Drivers

- Single code path for both modes; the mode only changes who the user is and where the sandbox runs.
- Local must stay zero-setup and unchanged in behavior.
- Cloud must be secure by default: real auth, isolation tests, quotas, SSRF guards.
- Reversible slices, each mergeable on its own (`MIGRATION.md` rule).

## 3. Considered Options

1. **Two products (local app + cloud fork).**
   - *Cons:* duplicated routes, tools, and bridge logic; fast divergence.
2. **One codebase, `DEPLOY_MODE=local|cloud` (selected).**
   - Every request carries a `userId`; in `local` it is always the fixed owner.
   - `local`: fixed owner on first boot, no login, bind `127.0.0.1` only, refuse non-loopback without auth.
   - `cloud`: Better Auth required, quotas on, remote sandbox.
3. **Framework-managed multi-tenancy (e.g. per-request DB switch deep in ORM).**
   - *Cons:* too much machinery for the current stage; deferred until SQLite limits are hit.

## 4. Decision Outcome

Adopt Option 2 with these rules:

- **Config:** `DEPLOY_MODE=local|cloud` in `server/config.ts` (zod enum, default `local`). Health endpoint reports the mode.
- **Identity:** `local` resolves to a stable `owner` user; `cloud` requires a validated Better Auth session (plus `organization` for future workspaces/sharing, `apiKey`/bearer for CLI/external agents). Same-origin cookies, `trustedOrigins`, secure cookies, rate-limit on auth routes. Email+password and GitHub/Google OAuth first; passkeys/2FA later.
- **Data:** all tables carry `user_id`/`workspace_id`; all access goes through one data layer that injects the filter. No raw SQL in routes. Isolation tests ("user A reads nothing of B") from the start. The existing opaque `contextId` stays domain-free; the core only checks ownership.
- **Storage path:** SQLite WAL on a single node with Litestream backup. Grow via one DB per workspace or libSQL/Turso later; keep the data layer swappable (Drizzle/Kysely) and use Better Auth adapters so a Postgres move does not hurt.
- **Sandbox:** `SandboxDriver` interface with `modal` (cloud), `docker` (local, optional), `none` drivers. Today Modal usage is glued to the core; extract it. Cloud: one sandbox per workspace with CPU/mem/time limits, idle shutdown, restricted egress, per-user spend ledger (extends the `image_spend` idea). Local: never mount `docker.sock` into the app container; prefer a limited-network sidecar or leave code execution off by default.
- **Browser worker:** block internal networks and `169.254.169.254`, isolate the worker from the private network, bind viewer tokens to `userId` + `workspaceId` and validate in the worker.
- **Bridge:** `window.polymax` checks capability per plugin **and** per user on every call, not only at install. Keep the two trust tiers (signed first-party vs user plugin).
- **Secrets:** encrypted at rest, never sent to the model or plugin iframe. Cloud decides between platform keys vs BYO key.
- **Approvals:** prompt-injection aware; approval engine covers publish, secrets, and external network (as already defined).

## 5. Consequences

### Positive

- No divergent code paths; local behavior unchanged.
- "Do not expose beyond localhost" becomes enforced code.
- Auth, isolation, quotas, and sandbox work can land as small reversible slices.

### Negative / Trade-offs

- Better Auth exact Hono + `bun:sqlite` wiring must be confirmed against the current docs version; do not guess the adapter syntax.
- Per-user filters touch many queries; needs discipline plus tests.
- Quotas, ledger, Litestream, and worker hardening are real operational work, sequenced after the data layer.

## 6. Migration Order (issues, in order)

1. Data layer with `user_id` + local fixed-owner mode (no behavior change for local users) — #191.
2. Better Auth + session middleware + isolation tests — #192.
3. `SandboxDriver` + quotas and spend ledger — #193.
4. Browser worker hardening (SSRF, per-user tokens) — #194.
5. Litestream backup + cloud deploy + healthchecks — #195.

Each slice is one PR (<400 lines), verified with `bun run check`.
