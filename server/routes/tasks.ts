import { Hono } from "hono";
import { TaskService } from "../services/taskService";

export const tasksRouter = new Hono();

/**
 * GET /api/tasks
 * Lists background tasks with optional filtering by status, sessionId, workspaceId.
 */
tasksRouter.get("/", (c) => {
  const sessionId = c.req.query("sessionId");
  const workspaceId = c.req.query("workspaceId");
  const status = c.req.query("status");
  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  const tasks = TaskService.listTasks({
    sessionId,
    workspaceId,
    status,
    limit,
  });

  return c.json({ tasks });
});

/**
 * GET /api/tasks/:id
 * Retrieve specific task details.
 */
tasksRouter.get("/:id", (c) => {
  const taskId = c.req.param("id");
  const task = TaskService.getTask(taskId);

  if (!task) {
    return c.json({ error: `Task "${taskId}" not found` }, 404);
  }

  return c.json({ task });
});

/**
 * POST /api/tasks/:id/cancel
 * Cancels a running background task.
 */
tasksRouter.post("/:id/cancel", async (c) => {
  const taskId = c.req.param("id");
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;
  const result = TaskService.cancelTask(taskId, workspaceId, "user");

  if (!result.cancelled && !result.task) {
    return c.json({ error: result.message }, 404);
  }

  return c.json(result);
});
