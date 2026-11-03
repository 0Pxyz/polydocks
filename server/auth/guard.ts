import { getEffectiveCaller, hasWorkspaceAccess, type EffectiveCaller } from "./session";

/**
 * Single ownership enforcement point for HTTP routes (Tarefa 1, #215).
 *
 * Every route that receives a workspaceId, sessionId, jobId/taskId or
 * executionId MUST pass through one of the denyUnless* helpers below.
 * No route calls hasWorkspaceAccess directly. A static test
 * (tests/route-guard-coverage.test.ts) walks the route table and fails
 * the CI when a new route takes one of those ids without the guard.
 *
 * Denial is uniform: 404 with a generic message, identical for
 * "does not exist" and "not yours" (no ids, no internal codes).
 */

const GENERIC_DENIAL = { error: "Not found" } as const;

/** Minimal Hono context shape this module needs (keeps helpers testable). */
type Ctx = {
  req: { raw: { headers: Headers } };
  json: (obj: unknown, status?: number) => Response;
};

export async function callerOf(c: Ctx): Promise<EffectiveCaller> {
  return getEffectiveCaller(c.req.raw.headers);
}

/** Uniform denial response. */
export function denied(c: Ctx): Response {
  return c.json({ ...GENERIC_DENIAL }, 404);
}

/**
 * Guard a raw workspace id. Absent id = global scope, allowed.
 * Present but inaccessible (or, in cloud mode, device-local) = 404.
 * Returns the denial Response, or null when the request may proceed.
 */
export async function denyUnlessWorkspace(
  c: Ctx,
  workspaceId?: string | null
): Promise<Response | null> {
  if (!workspaceId) return null;
  const caller = await callerOf(c);
  if (!hasWorkspaceAccess(workspaceId, caller)) return denied(c);
  return null;
}

/**
 * Guard by session id: resolves the session's workspace first, so a
 * session id can never escape its workspace. Missing session and
 * foreign session both yield the uniform 404.
 */
export async function denyUnlessSession(c: Ctx, sessionId: string): Promise<Response | null> {
  const { SessionService } = await import("../services/sessionService");
  const session = SessionService.getSession(sessionId);
  if (!session) return denied(c);
  return denyUnlessWorkspace(c, session.workspaceId);
}

/**
 * Guard by task/job id: resolves the task's workspace first.
 * Missing and foreign tasks both yield the uniform 404.
 */
export async function denyUnlessTask(c: Ctx, taskId: string): Promise<Response | null> {
  const { TaskService } = await import("../services/taskService");
  const task = TaskService.getTask(taskId);
  if (!task) return denied(c);
  return denyUnlessWorkspace(c, task.workspaceId);
}

/**
 * Guard by execution id: resolves the execution's workspace first.
 * Executions without a workspace (global audit rows) stay visible.
 * Missing and foreign executions both yield the uniform 404.
 */
export async function denyUnlessExecution(c: Ctx, executionId: string): Promise<Response | null> {
  const { db } = await import("../workspace/db");
  const row = db
    .query<{ workspace_id: string | null }, [string]>(
      "SELECT workspace_id FROM executions WHERE execution_id = ?"
    )
    .get(executionId) as { workspace_id: string | null } | null;
  if (!row) return denied(c);
  return denyUnlessWorkspace(c, row.workspace_id);
}

/** Filter a workspace-scoped list down to what the caller may see. */
export function visibleTo<T extends { workspaceId: string }>(
  caller: EffectiveCaller,
  items: T[]
): T[] {
  return items.filter((item) => hasWorkspaceAccess(item.workspaceId, caller));
}

/**
 * Guard by artifact id: resolves the artifact's workspace first.
 * Missing and foreign artifacts both yield the uniform 404.
 */
export async function denyUnlessArtifact(c: Ctx, artifactId: string): Promise<Response | null> {
  const { ArtifactService } = await import("../services/artifactService");
  const artifact = ArtifactService.getArtifact(artifactId);
  if (!artifact) return denied(c);
  return denyUnlessWorkspace(c, artifact.workspaceId);
}

/**
 * Identity gate for user-scoped (non-workspace) surfaces such as the
 * agent thread and memory. Local mode keeps today's open behavior;
 * cloud mode denies anonymous (kind=local) callers outright.
 */
export async function denyUnlessIdentified(c: Ctx): Promise<Response | null> {
  const { config } = await import("../config");
  if (config.DEPLOY_MODE === "local") return null;
  const caller = await callerOf(c);
  if (caller.kind !== "user") return denied(c);
  return null;
}

/** Filter a list of workspace ids down to what the caller may see. */
export function visibleIds(caller: EffectiveCaller, ids: string[]): string[] {
  return ids.filter((id) => hasWorkspaceAccess(id, caller));
}
