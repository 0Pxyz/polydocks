# Identity Foundation: Better Auth (Architecture Audit + Migration Plan)

Status: foundation landed on `feat/better-auth` (Better Auth 1.7.15, email/password + optional Google/GitHub OAuth).
This document is the audit and the plan. It stays as the living reference for follow-ups.

## 1. Audit: what existed before

| Concern | Before | Evidence |
|---|---|---|
| Authentication | None. `server/identity.ts` `sanitizeUserId`/`resolveUserIdForMode` only shapes an opaque id. Local mode pins `"local"`; cloud mode trusts the `x-polymax-user` header/query/body — any client can self-assert any id. | `server/identity.ts`, `ARCHITECTURE.md`, `docs/adr/0002-*.md` |
| Database | Single SQLite file (`DATA_DIR/polymax.db`, `bun:sqlite`, WAL) + `server/workspace/schema.sql` and idempotent `ensure*` functions. No user table, no ownership columns. | `server/workspace/db.ts`, `server/workspace/schema.sql` |
| Workspaces | Unscoped CRUD (`workspaces`, `workspace_plugins`, `dock_pins`). Every route trusts the client-supplied id. | `server/routes/workspaces.ts`, `server/services/workspaceService.ts` |
| Conversations / jobs | `sessions`/`tasks`/`job_events` keyed by `workspace_id` only; `agent_threads.user_id` is the same opaque string. No access checks. | `server/routes/sessions.ts`, `server/routes/tasks.ts`, `server/routes/thread.ts` |
| Docker sandbox | One container, volumes `/app/data` + `/app/agent-home`, `DEPLOY_MODE=local`, loopback bind. No secrets required. | `Dockerfile`, `docker-compose.yml` |
| Frontend identity | None. Settings surface = appearance customizer only. | `src/features/dock/ToolSurface.tsx` |

Reusable as-is: the SQLite file/WAL strategy, the idempotent migration pattern (`CREATE TABLE IF NOT EXISTS` + additive `ALTER`s), the audit log, the idempotency keys, the Docker volumes.

Migration risks addressed:
- No second identity system: the legacy `x-polymax-user` string is kept only as the **local-caller fallback**, never as a credential.
- No silent data loss: every migration is additive; `ensureAuthTables()` only creates missing tables/columns and never touches existing rows. Reversal = drop the four Better Auth tables + `workspace_members`.
- No shared-connection hazards: Better Auth reuses the existing `db` singleton (same file, same WAL mode).

## 2. Domain separation (non-negotiable)

- **User** — human identity. Owned by Better Auth (`user` table). PolyDocks code never writes it.
- **Workspace** — isolated environment + ownership boundary. Owned by PolyDocks (`workspaces` table, unchanged).
- **Membership** — a user's permissions within a workspace. Owned by PolyDocks (`workspace_members`: `workspace_id`, `user_id`, `role` ∈ `owner|member`). This is NOT the Better Auth Organization model; no org plugin is installed.
- **Agent** — workspace-owned Poly identity and configuration. Threads stay per-user for transcript continuity (`agent_threads.user_id` = Better Auth id when signed in, `"local"` otherwise); runtime state stays in workspace tables/files.

A user can own or participate in many workspaces. A workspace owns its filesystem slice, plugins + settings, agent config, memory, conversations, preferences, runtime state. Sync across devices is a future consumer of `workspace_members`, not something this foundation builds.

## 3. Local-first flow (the guarantee)

1. **Downloaded → local workspace.** No account, no env vars: `docker compose up` works. Anonymous callers see every **unowned** (zero-member, includes all pre-existing) workspace with exactly the old behavior.
2. **Created account → identity.** Email/password sign-up in Settings → Account. Session cookie (`better-auth.session_token`, 7-day expiry, daily refresh).
3. **Created another workspace → isolated environment.** Workspaces created while signed in get an `owner` membership row; other users (and anonymous callers) get 403/empty.
4. **New device → future recovery.** Membership rows already bind users to workspaces; sync ships later.

Cloud mode (`DEPLOY_MODE=cloud`, fork-only per ADR 0002): anonymous callers are denied everywhere, including unowned workspaces.

## 4. What the foundation implements

- `server/auth/index.ts` — `betterAuth({ database: db, … })` on the shared `bun:sqlite` connection. Email/password on; `requireEmailVerification: false` (sending works, login is never blocked before SMTP exists — one-flag flip, see §6); Google/GitHub mount only when both id + secret are set; no org/passkey/2FA plugins (reserved).
- `server/auth/membership.ts` — `ensureAuthTables()` runs Better Auth's own migration planner for the installed version (additive, logged) + `workspace_members` DDL. Helpers: `addWorkspaceMember`, `getWorkspaceMember`, `countWorkspaceMembers`, `listUserWorkspaceIds`, `listUserMemberships`, `remove(All)WorkspaceMember(s)`.
- `server/auth/session.ts` — `getEffectiveCaller()` (session → user, else legacy local), `hasWorkspaceAccess()` / `isWorkspaceOwner()` (the single enforcement point).
- Routes — `/api/auth/*` (Better Auth handler, Hono), `/api/account/*` (status + memberships join). Ownership checks on workspaces, sessions, tasks (+stream), artifacts, and `/api/agent` workspace gating; thread attribution prefers the Better Auth id when signed in.
- Frontend — `src/lib/auth-client.ts`, Settings → Account tab (`AccountSettingsView`): sign up/in/out, profile, email + verification state, change email, connected accounts (link/unlink, hidden until providers configured), change password, reset flow, active sessions + per-session revoke + sign-out-everywhere, workspace membership, delete account.
- Config — `BETTER_AUTH_SECRET` (required in production, dev fallback with warning), `BETTER_AUTH_URL`, `GOOGLE_*`, `GITHUB_*`, `SMTP_*` (unset = dev outbox + server log, never throws). All documented in `.env.example`.
- Tests — `tests/auth-foundation.test.ts` (11 tests): migration idempotence + local data preservation, sign-up/in, invalid credentials, verification roundtrip, reset roundtrip, session persistence, per-session revoke, sign-out, workspace isolation A-vs-B + anonymous, conversation/task/artifact denial, OAuth-disabled status, anonymous local mode.

## 5. Explicitly deferred (follow-ups, not this branch)

- SMTP delivery (today: dev outbox + log). Flip `requireEmailVerification` only together with SMTP.
- Passkeys + two-factor (schema reserved; install plugins when requested).
- Membership management UI beyond listing (invite/remove, roles) and agent-tool attribution of created workspaces.
- Plugin/settings/integration-secret scoping beyond workspace gating where a route still trusts device-local (tracked per route when touched).
- Cross-device sync (no speculative code).

## 6. Operational notes

- Fresh installs: schema works out of the box; OAuth buttons appear only with credentials.
- Existing installs: upgrade is a restart — migrations run at boot (logged), the `default` workspace stays unowned and fully working.
- Production: set `BETTER_AUTH_SECRET` (≥32 chars, `openssl rand -base64 32`) and `BETTER_AUTH_URL`; the server refuses to boot without the secret.
- Reversal: `DROP TABLE user/session/account/verification/workspace_members` returns the database to pre-auth shape (workspaces become device-local again).
