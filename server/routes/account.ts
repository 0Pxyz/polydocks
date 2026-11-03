import { Hono } from "hono";
import { getEffectiveCaller } from "../auth/session";
import { listUserMemberships } from "../auth/membership";
import { getAuthConfigSummary } from "../auth/index";
import { WorkspaceService } from "../services/workspaceService";

/**
 * GET /api/account/* : PolyDocks-owned account helpers. Better Auth owns
 * /api/auth/* (sign-up/in/out, verify, reset, OAuth, sessions); these
 * endpoints join account state with workspace membership, which is
 * PolyDocks-owned and lives outside the Better Auth schema.
 */
export const accountRouter = new Hono();

accountRouter.get("/status", async (c) => {
  const caller = await getEffectiveCaller(c.req.raw.headers);
  const providers = getAuthConfigSummary();
  if (caller.kind !== "user") {
    return c.json({
      signedIn: false,
      providers: { google: providers.google, github: providers.github },
    });
  }
  return c.json({
    signedIn: true,
    user: caller.user,
    providers: { google: providers.google, github: providers.github },
  });
});

accountRouter.get("/memberships", async (c) => {
  const caller = await getEffectiveCaller(c.req.raw.headers);
  if (caller.kind !== "user") {
    return c.json({ success: true, memberships: [] });
  }
  const rows = listUserMemberships(caller.user.id);
  const memberships = rows.map((m) => {
    const ws = WorkspaceService.getWorkspace(m.workspaceId);
    return {
      workspaceId: m.workspaceId,
      workspaceName: ws?.name ?? m.workspaceId,
      role: m.role,
      createdAt: m.createdAt,
    };
  });
  return c.json({ success: true, memberships });
});
