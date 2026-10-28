import { pluginRegistry } from "./registry";
import type { CapabilityRisk } from "./manifest";

export type ApprovalDecision = "allow_once" | "allow_always" | "denied";

export interface PendingApproval {
  id: string;
  pluginId: string;
  capabilityId: string;
  risk: CapabilityRisk;
  scope: string;
  summary: string;
  input: Record<string, unknown>;
  status: "pending" | ApprovalDecision;
  createdAt: string;
  timeoutMs: number;
  resolve: (decision: ApprovalDecision) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface ApprovalRequestPublic {
  id: string;
  pluginId: string;
  capabilityId: string;
  risk: CapabilityRisk;
  scope: string;
  summary: string;
  input: Record<string, unknown>;
  status: "pending" | ApprovalDecision;
  createdAt: string;
}

export class ApprovalManager {
  private static instance: ApprovalManager | null = null;
  private pendingApprovals = new Map<string, PendingApproval>();

  public static getInstance(): ApprovalManager {
    if (!ApprovalManager.instance) {
      ApprovalManager.instance = new ApprovalManager();
    }
    return ApprovalManager.instance;
  }

  /**
   * Request user approval for a restricted or high-risk capability action.
   * Halts until user confirms via POST /api/capabilities/approvals/:id or times out to "denied".
   */
  public async requestApproval(params: {
    pluginId: string;
    capabilityId: string;
    risk: CapabilityRisk;
    scope: string;
    summary?: string;
    input?: Record<string, unknown>;
    timeoutMs?: number;
    emit?: (event: { type: string; payload: Record<string, unknown> }) => Promise<void> | void;
  }): Promise<ApprovalDecision> {
    const id = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timeoutMs = params.timeoutMs ?? 15_000;
    const createdAt = new Date().toISOString();
    const summary =
      params.summary ||
      `Approval required for capability "${params.capabilityId}" (${params.risk}) on scope "${params.scope}".`;

    return new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(() => {
        const item = this.pendingApprovals.get(id);
        if (item && item.status === "pending") {
          item.status = "denied";
          this.pendingApprovals.delete(id);
          resolve("denied");
        }
      }, timeoutMs);

      const record: PendingApproval = {
        id,
        pluginId: params.pluginId,
        capabilityId: params.capabilityId,
        risk: params.risk,
        scope: params.scope,
        summary,
        input: params.input || {},
        status: "pending",
        createdAt,
        timeoutMs,
        resolve,
        timer,
      };

      this.pendingApprovals.set(id, record);

      // Emit SSE approval request event
      if (params.emit) {
        Promise.resolve(
          params.emit({
            type: "approval.requested",
            payload: {
              id,
              pluginId: params.pluginId,
              capabilityId: params.capabilityId,
              risk: params.risk,
              scope: params.scope,
              summary,
              input: params.input || {},
              createdAt,
            },
          })
        ).catch(() => {});
      }
    });
  }

  /**
   * Submit user decision for an approval request.
   */
  public resolveApproval(id: string, decision: ApprovalDecision): boolean {
    const item = this.pendingApprovals.get(id);
    if (!item || item.status !== "pending") {
      return false;
    }

    clearTimeout(item.timer);
    item.status = decision;

    if (decision === "allow_always") {
      pluginRegistry.grantPermission(
        item.pluginId,
        item.risk,
        item.scope,
        "allow_always"
      );
    } else if (decision === "allow_once") {
      pluginRegistry.grantPermission(
        item.pluginId,
        item.risk,
        item.scope,
        "allow_once"
      );
    }

    item.resolve(decision);
    this.pendingApprovals.delete(id);
    return true;
  }

  /**
   * Get an approval by ID.
   */
  public get(id: string): ApprovalRequestPublic | null {
    const item = this.pendingApprovals.get(id);
    if (!item) return null;
    return {
      id: item.id,
      pluginId: item.pluginId,
      capabilityId: item.capabilityId,
      risk: item.risk,
      scope: item.scope,
      summary: item.summary,
      input: item.input,
      status: item.status,
      createdAt: item.createdAt,
    };
  }

  /**
   * List pending approvals.
   */
  public listPending(): ApprovalRequestPublic[] {
    const results: ApprovalRequestPublic[] = [];
    for (const item of this.pendingApprovals.values()) {
      if (item.status === "pending") {
        results.push({
          id: item.id,
          pluginId: item.pluginId,
          capabilityId: item.capabilityId,
          risk: item.risk,
          scope: item.scope,
          summary: item.summary,
          input: item.input,
          status: item.status,
          createdAt: item.createdAt,
        });
      }
    }
    return results;
  }

  /**
   * Clear all pending approvals.
   */
  public clear(): void {
    for (const item of this.pendingApprovals.values()) {
      clearTimeout(item.timer);
      item.resolve("denied");
    }
    this.pendingApprovals.clear();
  }
}

export const approvalManager = ApprovalManager.getInstance();
