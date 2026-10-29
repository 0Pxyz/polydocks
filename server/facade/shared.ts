import { config } from "../config";
import { capabilityBus } from "../plugins/bus";
import { getContractCapability } from "../plugins/contract";
import { approvalManager, type ApprovalDecision } from "../plugins/approval";
import type { ModelRole } from "../agent/modelRegistry";
import type { AgentTool } from "../agent/tools/types";

export interface FacadeOk {
  ok: true;
  data: unknown;
  events: Array<{ type: string; payload: Record<string, unknown> }>;
}

export interface FacadeFail {
  ok: false;
  error: string;
  retryable: boolean;
  code?: string;
}

export type FacadeEnvelope = FacadeOk | FacadeFail;

export interface FacadeContext {
  actor?: "user" | "agent" | "cli";
  cityId?: string;
  workspaceId?: string;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// plugins.* — one canonical invoke path for the HTTP route, the CLI and the
// thin agent tool. Same input → same result + same events on all surfaces.
// ---------------------------------------------------------------------------

export async function invokeCapability(
  pluginId: string,
  capability: string,
  input: Record<string, unknown>,
  ctx: FacadeContext = {}
): Promise<FacadeEnvelope> {
  const def = getContractCapability(pluginId, capability);
  if (!def) {
    return {
      ok: false,
      error: `Unknown capability "${pluginId}.${capability}".`,
      retryable: false,
      code: "unknown_capability",
    };
  }
  const cityId =
    ctx.cityId ||
    (input && typeof (input as any).cityId === "string" ? (input as any).cityId : undefined);
  if (cityId && input && typeof (input as any).cityId !== "string") {
    input = { ...input, cityId };
  }
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const result = await capabilityBus.invoke(`${pluginId}.${capability}`, input, {
    actor: ctx.actor || "user",
    cityId,
    onEvent: async (e) => {
      if (e.type !== "tool.start" && e.type !== "tool.done") {
        emitted.push({ type: e.type, payload: e.payload as Record<string, unknown> });
      }
    },
  });
  if (!result.success) {
    return { ok: false, error: result.error || "Capability failed.", retryable: true };
  }
  const envelope = result.data as any;
  if (envelope && typeof envelope === "object" && "ok" in envelope) {
    return { ...envelope, events: [...(envelope.events ?? []), ...emitted] } as FacadeOk;
  }
  return { ok: true, data: envelope, events: emitted };
}

// ---------------------------------------------------------------------------
// dock.* — state and control of the dock. Delegates to the existing tool
// executors (list_tabs, open_tab, dock_pin/unpin/close, enter_city,
// get_city_context, apply_theme): no logic rewritten, only wrapped in the
// product envelope so routes, CLI and thin tools share one path.
// ---------------------------------------------------------------------------

export const DOCK_OPS = [
  "tabs.list",
  "tabs.open",
  "tabs.pin",
  "tabs.unpin",
  "tabs.close",
  "tabs.focus",
  "tabs.next",
  "tabs.prev",
  "tabs.background",
  "chat.toggle",
  "tabs.create",
  "tabs.update",
  "scope.enter",
  "scope.get",
  "appearance.apply",
] as const;

export type DockOp = (typeof DOCK_OPS)[number];

async function runTool<T>(tool: AgentTool<T>, args: T, ctx: FacadeContext): Promise<unknown> {
  return tool.execute(args, {
    cityId: ctx.cityId,
    workspaceId: ctx.workspaceId,
    sessionId: ctx.sessionId,
    step: 1,
    actor: ctx.actor === "agent" || ctx.actor === "cli" ? ctx.actor : "user",
  });
}

export async function dockAction(
  op: string,
  params: Record<string, unknown>,
  ctx: FacadeContext = {}
): Promise<FacadeEnvelope> {
  if (!(DOCK_OPS as readonly string[]).includes(op)) {
    return {
      ok: false,
      error: `Unknown dock op "${op}". Known: ${DOCK_OPS.join(", ")}.`,
      retryable: false,
      code: "unknown_op",
    };
  }
  try {
    switch (op as DockOp) {
      case "tabs.list": {
        const { list_tabs } = await import("../agent/tools/list_tabs");
        const data = await runTool(list_tabs, { cityId: params.cityId as string | undefined } as any, {
          ...ctx,
          cityId: (params.cityId as string) || ctx.cityId,
        });
        const { DOCK_ACTIONS, visibleDockItems } = await import("../workspace/dockItems");
        const contextId = (params.cityId as string) || ctx.cityId || null;
        return {
          ok: true,
          data: { ...(data as object), actions: DOCK_ACTIONS, dockItems: visibleDockItems(contextId) },
          events: [],
        };
      }
      case "tabs.open": {
        const { open_tab } = await import("../agent/tools/open_tab");
        if (typeof params.tabId !== "string" || !params.tabId) {
          return { ok: false, error: "tabs.open needs { tabId }.", retryable: false, code: "invalid_input" };
        }
        const data = await runTool(
          open_tab,
          { tabId: params.tabId, cityId: params.cityId } as any,
          { ...ctx, cityId: (params.cityId as string) || ctx.cityId }
        );
        const { openDockItem } = await import("../workspace/dockItems");
        const contextId = (params.cityId as string) || ctx.cityId || null;
        const record = openDockItem(params.tabId, contextId);
        return { ok: true, data: { ...(data as object), dockItem: record }, events: [{ type: "tray.open", payload: params }] };
      }
      case "tabs.pin":
      case "tabs.unpin": {
        const mod = op === "tabs.pin" ? await import("../agent/tools/dock_pin") : await import("../agent/tools/dock_unpin");
        const tool = op === "tabs.pin" ? mod.dock_pin : mod.dock_unpin;
        if (typeof params.id !== "string" || !params.id) {
          return { ok: false, error: `${op} needs { id }.`, retryable: false, code: "invalid_input" };
        }
        const data = await runTool(tool, { id: params.id, cityId: params.cityId } as any, {
          ...ctx,
          cityId: (params.cityId as string) || ctx.cityId,
        });
        return { ok: true, data, events: [] };
      }
      case "tabs.close": {
        const { dock_close } = await import("../agent/tools/dock_close");
        if (typeof params.id !== "string" || !params.id) {
          return { ok: false, error: "tabs.close needs { id }.", retryable: false, code: "invalid_input" };
        }
        const data = await runTool(dock_close, { id: params.id, cityId: params.cityId } as any, {
          ...ctx,
          cityId: (params.cityId as string) || ctx.cityId,
        });
        const { closeDockItem } = await import("../workspace/dockItems");
        const record = closeDockItem(params.id);
        return { ok: true, data: { ...(data as object), dockItem: record }, events: [{ type: "tray.closed", payload: params }] };
      }
      case "tabs.focus": {
        const { visibleDockItems, openDockItem } = await import("../workspace/dockItems");
        const contextId = (params.cityId as string) || ctx.cityId || null;
        const visible = visibleDockItems(contextId);
        const index = typeof params.index === "number" ? params.index : 0;
        const target = visible[index];
        if (!target) {
          return { ok: false, error: "tabs.focus: index out of range.", retryable: false, code: "not_found" };
        }
        const record = openDockItem(target.id, contextId);
        return { ok: true, data: { id: record.id, dockItem: record }, events: [{ type: "tab.focused", payload: { id: record.id } }] };
      }
      case "tabs.next":
      case "tabs.prev": {
        const { visibleDockItems, openDockItem } = await import("../workspace/dockItems");
        const contextId = (params.cityId as string) || ctx.cityId || null;
        const visible = visibleDockItems(contextId);
        if (visible.length === 0) {
          return { ok: false, error: `${op}: nothing to focus.`, retryable: false, code: "not_found" };
        }
        const direction = op === "tabs.next" ? 1 : -1;
        const currentIndex = visible.findIndex((r) => r.state === "focused");
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + visible.length) % visible.length;
        const record = openDockItem(visible[nextIndex].id, contextId);
        return { ok: true, data: { id: record.id, dockItem: record }, events: [{ type: "tab.focused", payload: { id: record.id } }] };
      }
      case "tabs.background": {
        if (typeof params.id !== "string" || !params.id) {
          return { ok: false, error: "tabs.background needs { id }.", retryable: false, code: "invalid_input" };
        }
        const { backgroundDockItem } = await import("../workspace/dockItems");
        const record = backgroundDockItem(params.id);
        if (!record) {
          return { ok: false, error: `No dock item "${params.id}" found.`, retryable: false, code: "not_found" };
        }
        return { ok: true, data: { id: record.id, dockItem: record }, events: [{ type: "tab.backgrounded", payload: { id: record.id } }] };
      }
      case "chat.toggle": {
        const { getDockItem, openDockItem, closeDockItem } = await import("../workspace/dockItems");
        const chat = getDockItem("agent");
        if (chat?.state === "focused" || chat?.state === "open") {
          const record = closeDockItem("agent");
          return { ok: true, data: { id: "agent", dockItem: record }, events: [{ type: "chat.hidden", payload: {} }] };
        }
        const record = openDockItem("agent", null);
        return { ok: true, data: { id: "agent", dockItem: record }, events: [{ type: "chat.focused", payload: {} }] };
      }
      case "tabs.create": {
        const { create_tab } = await import("../agent/tools/create_tab");
        const data = await runTool(create_tab, (params ?? {}) as any, {
          ...ctx,
          cityId: (params.cityId as string) || ctx.cityId,
        });
        return { ok: true, data, events: [{ type: "tab.created", payload: (params ?? {}) as Record<string, unknown> }] };
      }
      case "tabs.update": {
        const { update_tab } = await import("../agent/tools/update_tab");
        const data = await runTool(update_tab, (params ?? {}) as any, {
          ...ctx,
          cityId: (params.cityId as string) || ctx.cityId,
        });
        return { ok: true, data, events: [] };
      }
      case "scope.enter": {
        const { enter_city } = await import("../agent/tools/enter_city");
        if (typeof params.cityId !== "string" || !params.cityId) {
          return { ok: false, error: "scope.enter needs { cityId }.", retryable: false, code: "invalid_input" };
        }
        const data = await runTool(enter_city, { cityId: params.cityId } as any, ctx);
        return { ok: true, data, events: [{ type: "map.changed", payload: { cityId: params.cityId } }] };
      }
      case "scope.get": {
        const { get_city_context } = await import("../agent/tools/get_city_context");
        const data = await runTool(
          get_city_context,
          { cityId: params.cityId } as any,
          { ...ctx, cityId: (params.cityId as string) || ctx.cityId }
        );
        return { ok: true, data, events: [] };
      }
      case "appearance.apply": {
        const { apply_theme } = await import("../agent/tools/apply_theme");
        const data = await runTool(apply_theme, (params ?? {}) as any, ctx);
        return { ok: true, data, events: [{ type: "theme.apply", payload: (params ?? {}) as Record<string, unknown> }] };
      }
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || "Dock action failed.", retryable: false };
  }
  return { ok: false, error: `Unhandled dock op "${op}".`, retryable: false, code: "unknown_op" };
}

// ---------------------------------------------------------------------------
// plugins lifecycle — create/modify/publish/install. Same executors the
// agent tools use, wrapped so routes, CLI and the thin tool share one path.
// ---------------------------------------------------------------------------

export const PLUGIN_LIFECYCLE_OPS = ["create", "modify", "publish", "install", "uninstall"] as const;

export async function pluginLifecycle(
  op: string,
  params: Record<string, unknown>,
  ctx: FacadeContext = {}
): Promise<FacadeEnvelope> {
  if (!(PLUGIN_LIFECYCLE_OPS as readonly string[]).includes(op)) {
    return {
      ok: false,
      error: `Unknown lifecycle op "${op}". Known: ${PLUGIN_LIFECYCLE_OPS.join(", ")}.`,
      retryable: false,
      code: "unknown_op",
    };
  }
  // Install policy (config INSTALL_POLICY, default ask): agent-originated
  // create/modify/install/publish need an explicit user yes (userApproved, same
  // pattern as delete_tab). actor=user|cli means an explicit human action.
  if ((op === "create" || op === "modify" || op === "install" || op === "publish") && ctx.actor === "agent") {
    if (config.INSTALL_POLICY === "never") {
      return {
        ok: false,
        error: "Install policy is 'never': the agent may not create, install or publish plugins.",
        retryable: false,
        code: "install_denied",
      };
    }
    if (config.INSTALL_POLICY !== "auto" && (params as any).userApproved !== true) {
      return {
        ok: false,
        error: "Install policy is 'ask': confirm with the user first, then retry with { userApproved: true }.",
        retryable: false,
        code: "approval_required",
      };
    }
  }
  // Visual kit gate: create/edit with code, publish with stored code.
  // Agent-created code is validated strict (structural slop fails);
  // legacy/first-party code gets warnings. Fails closed with rule names.
  if (op === "create" || (op === "modify" && typeof (params as any).code === "string")) {
    const { validateSlop } = await import("../plugins/slop");
    const report = validateSlop(String((params as any).code ?? ""), { strict: ctx.actor === "agent" });
    if (!report.ok) {
      return {
        ok: false,
        error: `Design kit violation: ${report.errors.join("; ")}`,
        retryable: false,
        code: "slop_violation",
      };
    }
  }
  try {
    const eventName =
      op === "create" ? "plugin.created" : op === "modify" ? "plugin.updated" : op === "publish" ? "plugin.published" : op === "install" ? "plugin.installed" : "plugin.uninstalled";
    if (op === "install") {
      const { WorkspaceService } = await import("../services/workspaceService");
      const { getRegistryPlugin } = await import("../plugins/communityRegistry");
      const { PluginService } = await import("../services/pluginService");
      const { getPluginFile } = await import("../workspace/pluginFiles");
      const pluginId = params.pluginId as string;
      if (!pluginId) {
        return { ok: false, error: "lifecycle install needs { pluginId }.", retryable: false, code: "invalid_input" };
      }
      const workspaceId = (params.workspaceId as string) || ctx.workspaceId || "default";
      const known =
        PluginService.getPlugin(pluginId) !== null ||
        getRegistryPlugin(pluginId) !== null ||
        getPluginFile(pluginId, workspaceId) !== null ||
        getPluginFile(pluginId, undefined) !== null;
      if (!known) {
        // No ghost mounts: unknown ids fail instead of mounting an empty shell.
        return { ok: false, error: `Plugin "${pluginId}" not found in the local registry, the store, or workspace files.`, retryable: false, code: "not_found" };
      }
      const inRegistry = getRegistryPlugin(pluginId);
      if (inRegistry) {
        const { installFromRegistry } = await import("../plugins/communityRegistry");
        const installed = await installFromRegistry(pluginId, workspaceId);
        if (!(installed as any)?.success) {
          return { ok: false, error: (installed as any)?.error || "Registry install failed.", retryable: true };
        }
        return { ok: true, data: { pluginId, workspaceId, via: "registry" }, events: [{ type: eventName, payload: { pluginId } }] };
      }
      const mounted = WorkspaceService.addPluginToWorkspace(workspaceId, pluginId, {}, 0, ctx.actor || "user");
      return { ok: true, data: { pluginId, workspaceId, via: "workspace", mounted }, events: [{ type: eventName, payload: { pluginId } }] };
    }
    if (op === "uninstall") {
      const { WorkspaceService } = await import("../services/workspaceService");
      const pluginId = params.pluginId as string;
      if (!pluginId) {
        return { ok: false, error: "lifecycle uninstall needs { pluginId }.", retryable: false, code: "invalid_input" };
      }
      const workspaceId = (params.workspaceId as string) || ctx.workspaceId || "default";
      const mounted = WorkspaceService.listWorkspacePlugins(workspaceId).some((p) => p.pluginId === pluginId);
      if (!mounted) {
        return { ok: false, error: `Plugin "${pluginId}" is not installed in workspace "${workspaceId}".`, retryable: false, code: "not_found" };
      }
      WorkspaceService.removePluginFromWorkspace(workspaceId, pluginId);
      return { ok: true, data: { pluginId, workspaceId, uninstalled: true }, events: [{ type: eventName, payload: { pluginId } }] };
    }
    if (op === "publish") {
      const pluginId = (params as any).pluginId as string;
      if (pluginId) {
        const { getPluginFile } = await import("../workspace/pluginFiles");
        const stored = getPluginFile(pluginId, (params as any).workspaceId as string || ctx.workspaceId);
        if (stored?.sourceCode) {
          const { validateSlop } = await import("../plugins/slop");
          const report = validateSlop(stored.sourceCode, { strict: ctx.actor === "agent" });
          if (!report.ok) {
            return {
              ok: false,
              error: `Design kit violation in stored code: ${report.errors.join("; ")}`,
              retryable: false,
              code: "slop_violation",
            };
          }
        }
      }
    }
    const mod =
      op === "create"
        ? await import("../agent/tools/create_plugin")
        : op === "modify"
          ? await import("../agent/tools/modify_plugin")
          : await import("../agent/tools/publish_plugin");
    const tool = op === "create" ? mod.create_plugin : op === "modify" ? mod.modify_plugin : mod.publish_plugin;
    const data = await runTool(tool, (params ?? {}) as any, ctx);
    const dataOk = (data as any)?.success !== false;
    if (!dataOk) {
      return { ok: false, error: (data as any)?.error || "Plugin lifecycle op failed.", retryable: false, code: (data as any)?.code };
    }
    return { ok: true, data, events: [{ type: eventName, payload: (params ?? {}) as Record<string, unknown> }] };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Plugin lifecycle op failed.", retryable: false };
  }
}

// ---------------------------------------------------------------------------
/** List kept versions of a plugin (workspace files + registry history). */
export async function pluginVersions(pluginId: string): Promise<FacadeEnvelope> {
  if (!pluginId) {
    return { ok: false, error: "versions needs { pluginId }.", retryable: false, code: "invalid_input" };
  }
  try {
    const { listVersions } = await import("../plugins/versions");
    const { listPluginFiles } = await import("../workspace/pluginFiles");
    const { db } = await import("../workspace/db");
    const seen = new Map<string, { version: string; via: string; workspaceId?: string }>();
    let workspaces: string[] = ["default"];
    try {
      workspaces = (db.query("SELECT DISTINCT workspace_id as id FROM plugin_files").all() as any[]).map((r) => r.id);
    } catch {
      // Fall back to default.
    }
    for (const ws of workspaces) {
      try {
        for (const p of listPluginFiles(ws)) {
          if (p.pluginId === pluginId && !seen.has(`ws:${p.version}`)) {
            seen.set(`ws:${p.version}`, { version: p.version, via: "workspace", workspaceId: ws });
          }
        }
      } catch {
        // Workspace may not exist; ignore.
      }
    }
    for (const v of listVersions(pluginId)) {
      if (!seen.has(`reg:${v.version}`)) {
        seen.set(`reg:${v.version}`, { version: v.version, via: "registry", workspaceId: v.workspaceId });
      }
    }
    return { ok: true, data: { pluginId, versions: [...seen.values()] }, events: [] };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Versions lookup failed.", retryable: false };
  }
}

/**
 * Roll back a plugin to a kept version. Workspace plugins: append a new
 * version row with the old content (history is append-only, nothing is
 * overwritten or deleted). Registry-tracked plugins: reactivate via the
 * versions table.
 */
export async function pluginRollback(
  pluginId: string,
  version: string,
  workspaceId?: string
): Promise<FacadeEnvelope> {
  if (!pluginId || !version) {
    return { ok: false, error: "rollback needs { pluginId, version }.", retryable: false, code: "invalid_input" };
  }
  try {
    const { getPluginFile, upsertPluginFile } = await import("../workspace/pluginFiles");
    const ws = workspaceId || "default";
    const target = getPluginFile(pluginId, ws, version) || getPluginFile(pluginId, undefined, version);
    if (target) {
      const bumped = bumpPatch(target.version);
      const manifest = { ...(target.manifest as object), version: bumped } as any;
      upsertPluginFile({
        workspaceId: target.workspaceId,
        pluginId,
        version: bumped,
        manifest,
        sourceCode: target.sourceCode,
        srcdoc: target.srcdoc,
      });
      return {
        ok: true,
        data: { pluginId, version: bumped, restoredFrom: target.version, via: "workspace" },
        events: [{ type: "plugin.updated", payload: { pluginId, version: bumped } }],
      };
    }
    const { rollbackPlugin, listVersions } = await import("../plugins/versions");
    if (!listVersions(pluginId).some((v) => v.version === version)) {
      return { ok: false, error: `Version "${version}" of "${pluginId}" is not kept.`, retryable: false, code: "not_found" };
    }
    const restored = rollbackPlugin(pluginId, version);
    if (!restored.success) {
      return { ok: false, error: restored.error || "Rollback failed.", retryable: true };
    }
    return { ok: true, data: { pluginId, version: restored.version, via: "registry" }, events: [{ type: "plugin.updated", payload: { pluginId } }] };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Rollback failed.", retryable: true };
  }
}

function bumpPatch(version: string): string {
  const m = String(version || "").match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!m) return `${version || "1.0.0"}-rollback-1`;
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}${m[4]}`;
}

// agent.* — the agent's own surface: loop-adjacent state (sessions, tasks,
// approvals, memory, models, runtime status). Same functions serve the
// facade routes, the CLI and the thin agent tools.
// ---------------------------------------------------------------------------

export async function agentMemory(
  op: "recall" | "record",
  params: Record<string, unknown>,
  ctx: FacadeContext = {}
): Promise<FacadeEnvelope> {
  try {
    if (op === "recall") {
      const { recall_memory } = await import("../agent/tools/recall_memory");
      const data = await runTool(recall_memory, (params ?? {}) as any, ctx);
      return { ok: true, data, events: [] };
    }
    if (op === "record") {
      const { record_memory } = await import("../agent/tools/record_memory");
      const data = await runTool(record_memory, (params ?? {}) as any, ctx);
      return { ok: true, data, events: [] };
    }
    return { ok: false, error: `Unknown memory op "${op}" (recall|record).`, retryable: false, code: "unknown_op" };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Memory op failed.", retryable: false };
  }
}

export async function agentSession(
  op: "list" | "resume",
  params: Record<string, unknown> = {},
  ctx: FacadeContext = {}
): Promise<FacadeEnvelope> {
  try {
    const { SessionService } = await import("../services/sessionService");
    if (op === "list") {
      const data = SessionService.listSessions(
        (params.workspaceId as string) || ctx.workspaceId
      );
      return { ok: true, data, events: [] };
    }
    if (op === "resume") {
      const id = params.sessionId as string;
      if (!id) return { ok: false, error: "session.resume needs { sessionId }.", retryable: false, code: "invalid_input" };
      const session = SessionService.getSession(id);
      if (!session) return { ok: false, error: `Session "${id}" not found.`, retryable: false, code: "not_found" };
      const transcript = await SessionService.getTranscript(id, {
        offset: params.fromStep as number | undefined,
        rootDir: process.env.AGENT_HOME_DIR,
      });
      return { ok: true, data: { session, transcript }, events: [] };
    }
    return { ok: false, error: `Unknown session op "${op}" (list|resume).`, retryable: false, code: "unknown_op" };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Session op failed.", retryable: false };
  }
}

export async function agentTask(
  op: "list" | "cancel",
  params: Record<string, unknown> = {},
  _ctx: FacadeContext = {}
): Promise<FacadeEnvelope> {
  try {
    const { TaskService } = await import("../services/taskService");
    if (op === "list") {
      const data = TaskService.listTasks({
        status: params.status as string | undefined,
        sessionId: params.sessionId as string | undefined,
        workspaceId: params.workspaceId as string | undefined,
      });
      return { ok: true, data, events: [] };
    }
    if (op === "cancel") {
      const id = params.taskId as string;
      if (!id) return { ok: false, error: "task.cancel needs { taskId }.", retryable: false, code: "invalid_input" };
      const data = TaskService.cancelTask(id);
      return { ok: true, data, events: [{ type: "task.cancelled", payload: { taskId: id } }] };
    }
    return { ok: false, error: `Unknown task op "${op}" (list|cancel).`, retryable: false, code: "unknown_op" };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Task op failed.", retryable: false };
  }
}

export async function agentApprovals(
  op: "list" | "resolve",
  params: Record<string, unknown> = {}
): Promise<FacadeEnvelope> {
  if (op === "list") {
    return { ok: true, data: approvalManager.listPending(), events: [] };
  }
  if (op === "resolve") {
    const { id, decision } = params as { id?: string; decision?: ApprovalDecision };
    if (decision !== "allow_once" && decision !== "allow_always" && decision !== "deny") {
      return {
        ok: false,
        error: "Invalid decision. Must be one of: 'allow_once', 'allow_always', or 'deny'.",
        retryable: false,
        code: "invalid_input",
      };
    }
    const resolved = approvalManager.resolveApproval(id as string, decision);
    if (!resolved) {
      return {
        ok: false,
        error: "Approval request not found or has already been resolved or timed out.",
        retryable: false,
        code: "not_found",
      };
    }
    return { ok: true, data: { id, decision }, events: [{ type: "approval.resolved", payload: { id, decision } }] };
  }
  return { ok: false, error: `Unknown approvals op "${op}" (list|resolve).`, retryable: false, code: "unknown_op" };
}

/** Runtime status: same numbers the CLI prints (model, tinyfish, counts). */export async function agentStatus(): Promise<FacadeEnvelope> {
  try {
    const { WorkspaceService } = await import("../services/workspaceService");
    const { SessionService } = await import("../services/sessionService");
    const { TaskService } = await import("../services/taskService");
    const { PluginService } = await import("../services/pluginService");
    const workspaces = WorkspaceService.listWorkspaces();
    const defaultWs = workspaces.find((w) => w.isDefault) || workspaces[0];
    return {
      ok: true,
      data: {
        model: {
          id: config.MODEL_ID,
          configured: Boolean(config.MODEL_API_KEY?.trim()),
          surface: { product: config.PRODUCT_SURFACE, agent: config.AGENT_SURFACE },
        },
        tinyfish: { configured: Boolean(config.TINYFISH_API_KEY?.trim()) },
        activeWorkspace: defaultWs ? { id: defaultWs.id, name: defaultWs.name } : null,
        counts: {
          workspaces: workspaces.length,
          sessions: SessionService.listSessions().length,
          runningTasks: TaskService.listTasks({ status: "running" }).length,
          installedPlugins: PluginService.listPlugins().length,
        },
      },
      events: [],
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Status failed.", retryable: false };
  }
}

/** Model roles the agent can use. Secrets never leave the server. */
export async function agentModels(): Promise<FacadeEnvelope> {
  const { getModelForRole } = await import("../agent/modelRegistry");
  const roles: ModelRole[] = ["agent", "fast", "vision", "voice", "image", "segmentation"];
  const data = Object.fromEntries(
    roles.map((role) => {
      const m = getModelForRole(role);
      return [role, { provider: m.provider, modelId: m.modelId, configured: m.configured }];
    })
  );
  return { ok: true, data, events: [] };
}
