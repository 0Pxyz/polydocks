import {
  createTask as createTsk,
  getTask as getTsk,
  listTasks as listTsks,
  updateTaskState as updateTskState,
  taskExecutionEngine,
  type AgentTask,
  type TaskStatus,
  type TaskExecutor,
} from "../agent/taskRunner";
import { recordAudit, type AuditActor } from "./audit";
import { withIdempotency } from "./idempotency";

export interface CreateTaskInput {
  sessionId: string;
  workspaceId: string;
  type?: string;
  input?: Record<string, unknown>;
  id?: string;
  actor?: AuditActor;
  idempotencyKey?: string;
}

export class TaskService {
  public static async createTask(input: CreateTaskInput): Promise<AgentTask> {
    return await withIdempotency(
      input.idempotencyKey,
      "task.create",
      input.id,
      async () => {
        const task = createTsk({
          sessionId: input.sessionId,
          workspaceId: input.workspaceId,
          type: input.type,
          input: input.input,
          id: input.id,
        });

        recordAudit({
          actor: input.actor || "user",
          action: "task.create",
          targetId: task.id,
          details: { sessionId: task.sessionId, workspaceId: task.workspaceId, type: task.type },
        });

        return task;
      }
    );
  }

  public static getTask(taskId: string): AgentTask | null {
    return getTsk(taskId);
  }

  public static listTasks(options?: {
    sessionId?: string;
    workspaceId?: string;
    status?: string;
    limit?: number;
  }): AgentTask[] {
    return listTsks(options);
  }

  public static async runTask(
    task: AgentTask,
    options?: {
      executor?: TaskExecutor;
      rootDir?: string;
      actor?: AuditActor;
    }
  ): Promise<AgentTask> {
    recordAudit({
      actor: options?.actor || "user",
      action: "task.start",
      targetId: task.id,
      details: { sessionId: task.sessionId, workspaceId: task.workspaceId, type: task.type },
    });

    return await taskExecutionEngine.runTaskInBackground(task, options);
  }

  public static updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    data?: { progress?: number; output?: Record<string, unknown>; error?: string },
    actor: AuditActor = "user"
  ): AgentTask | null {
    updateTskState(taskId, status, data);
    recordAudit({
      actor,
      action: "task.update_status",
      targetId: taskId,
      details: { status, ...data },
    });
    return getTsk(taskId);
  }

  public static cancelTask(
    taskId: string,
    workspaceId?: string,
    actor: AuditActor = "user"
  ): { cancelled: boolean; task?: AgentTask; message: string } {
    const result = taskExecutionEngine.cancelTask(taskId, workspaceId);
    if (result.cancelled) {
      recordAudit({
        actor,
        action: "task.cancel",
        targetId: taskId,
        details: { workspaceId },
      });
    }
    return result;
  }
}
