import {
  listWorkspaces as listWs,
  getWorkspace as getWs,
  createWorkspace as createWs,
  updateWorkspace as updateWs,
  deleteWorkspace as deleteWs,
  listWorkspacePlugins as listWsPlugins,
  addPluginToWorkspace as addPluginToWs,
  removePluginFromWorkspace as removePluginFromWs,
  setWorkspacePluginStatus as setWsPluginStatus,
  type WorkspaceRecord,
  type WorkspacePluginRecord,
} from "../workspace/workspaces";
import { recordAudit, type AuditActor } from "./audit";
import { withIdempotency } from "./idempotency";

export interface CreateWorkspaceInput {
  id?: string;
  name: string;
  description?: string;
  icon?: string;
  isDefault?: boolean;
  actor?: AuditActor;
  idempotencyKey?: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
  icon?: string;
  actor?: AuditActor;
}

export class WorkspaceService {
  public static async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRecord> {
    return await withIdempotency(
      input.idempotencyKey,
      "workspace.create",
      input.id || input.name,
      async () => {
        const ws = createWs({
          id: input.id,
          name: input.name,
          description: input.description,
          icon: input.icon,
          isDefault: input.isDefault,
        });

        recordAudit({
          actor: input.actor || "user",
          action: "workspace.create",
          targetId: ws.id,
          details: { name: ws.name, description: ws.description, icon: ws.icon },
        });

        return ws;
      }
    );
  }

  public static listWorkspaces(): WorkspaceRecord[] {
    return listWs();
  }

  public static getWorkspace(id: string): WorkspaceRecord | null {
    return getWs(id);
  }

  public static updateWorkspace(
    id: string,
    updates: UpdateWorkspaceInput
  ): WorkspaceRecord | null {
    const updated = updateWs(id, updates);
    if (updated) {
      recordAudit({
        actor: updates.actor || "user",
        action: "workspace.update",
        targetId: id,
        details: updates,
      });
    }
    return updated;
  }

  public static deleteWorkspace(
    id: string,
    actor: AuditActor = "user"
  ): { success: boolean; error?: string } {
    const result = deleteWs(id);
    if (result.success) {
      recordAudit({
        actor,
        action: "workspace.delete",
        targetId: id,
      });
    }
    return result;
  }

  public static switchActiveWorkspace(
    id: string,
    actor: AuditActor = "user"
  ): WorkspaceRecord | null {
    const ws = getWs(id);
    if (!ws) return null;

    recordAudit({
      actor,
      action: "workspace.switch",
      targetId: id,
      details: { name: ws.name },
    });

    return ws;
  }

  public static listWorkspacePlugins(workspaceId: string): WorkspacePluginRecord[] {
    return listWsPlugins(workspaceId);
  }

  public static addPluginToWorkspace(
    workspaceId: string,
    pluginId: string,
    settings: Record<string, unknown> = {},
    position = 0,
    actor: AuditActor = "user"
  ): WorkspacePluginRecord {
    const record = addPluginToWs(workspaceId, pluginId, settings, position);
    recordAudit({
      actor,
      action: "workspace.plugin.add",
      targetId: `${workspaceId}:${pluginId}`,
      details: { workspaceId, pluginId, position, settings },
    });
    return record;
  }

  public static removePluginFromWorkspace(
    workspaceId: string,
    pluginId: string,
    actor: AuditActor = "user"
  ): boolean {
    const ok = removePluginFromWs(workspaceId, pluginId);
    if (ok) {
      recordAudit({
        actor,
        action: "workspace.plugin.remove",
        targetId: `${workspaceId}:${pluginId}`,
        details: { workspaceId, pluginId },
      });
    }
    return ok;
  }

  public static setWorkspacePluginStatus(
    workspaceId: string,
    pluginId: string,
    enabled: boolean,
    actor: AuditActor = "user"
  ): boolean {
    const ok = setWsPluginStatus(workspaceId, pluginId, enabled);
    if (ok) {
      recordAudit({
        actor,
        action: enabled ? "workspace.plugin.enable" : "workspace.plugin.disable",
        targetId: `${workspaceId}:${pluginId}`,
        details: { workspaceId, pluginId, enabled },
      });
    }
    return ok;
  }
}
