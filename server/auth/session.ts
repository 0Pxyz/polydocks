import { auth } from "./index";
import { config } from "../config";
import { DEFAULT_USER_ID, resolveUserIdForMode } from "../identity";
import { countWorkspaceMembers, getWorkspaceMember } from "./membership";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export type EffectiveCaller =
  | { kind: "user"; user: SessionUser }
  | { kind: "local"; userId: string };

/**
 * Resolves the caller for a request. Priority:
 * 1. Better Auth session (cookie/bearer) -> authenticated user.
 * 2. Legacy local identity (`x-polydocks-user` / query / body) -> local caller.
 *
 * Never throws: auth failures degrade to the local caller so the local
 * Docker sandbox and existing device-local flows keep working.
 */
export async function getEffectiveCaller(headers: Headers): Promise<EffectiveCaller> {
  try {
    const session = await auth.api.getSession({ headers });
    const u = (session as any)?.user;
    if (u?.id) {
      return {
        kind: "user",
        user: {
          id: String(u.id),
          email: String(u.email ?? ""),
          name: String(u.name ?? ""),
          emailVerified: Boolean(u.emailVerified),
        },
      };
    }
  } catch {
    // Degrade to local caller below.
  }
  const header = headers.get("x-polydocks-user");
  return {
    kind: "local",
    userId: resolveUserIdForMode({ header }, config.DEPLOY_MODE),
  };
}

/** Effective user id for thread/memory attribution (Better Auth id or "local"). */
export function effectiveUserId(caller: EffectiveCaller): string {
  return caller.kind === "user" ? caller.user.id : caller.userId;
}

/**
 * Server-side workspace ownership check. NEVER trust a client-supplied
 * workspace id on its own:
 * - Cloud mode without a session: deny everything (ADR 0002 fork rule).
 * - Cloud mode device-local (unowned) workspace: deny everything too —
 *   the "default stays open" rule is local-only (Tarefa 1). Every
 *   workspace resource in cloud requires an authenticated member.
 * - Local unowned (legacy/device-local) workspace: allow (local-first
 *   compat; anyone with access to the device/server keeps today's
 *   behavior).
 * - Owned workspace: allow only to members.
 */
export function hasWorkspaceAccess(
  workspaceId: string,
  caller: EffectiveCaller
): boolean {
  if (config.DEPLOY_MODE === "cloud" && caller.kind === "local") return false;
  const owned = countWorkspaceMembers(workspaceId) > 0;
  if (!owned) return config.DEPLOY_MODE === "local";
  if (caller.kind !== "user") return false;
  return getWorkspaceMember(workspaceId, caller.user.id) !== null;
}

export function isWorkspaceOwner(
  workspaceId: string,
  caller: EffectiveCaller
): boolean {
  if (caller.kind !== "user") return false;
  const m = getWorkspaceMember(workspaceId, caller.user.id);
  return m?.role === "owner";
}

/** Legacy helper kept for routes not yet migrated: local user id or "local". */
export function legacyUserId(headerValue: string | null): string {
  if (!headerValue) return DEFAULT_USER_ID;
  return resolveUserIdForMode({ header: headerValue }, config.DEPLOY_MODE);
}
