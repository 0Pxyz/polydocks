import { z } from "zod";
import type { AgentTool } from "../../types";
import { dockAction, invokeCapability, pluginLifecycle, pluginRollback, pluginSetActive } from "../../../facade/shared";

function actorCtx(ctx: { workspaceId?: string; sessionId?: string }) {
  return { actor: "agent" as const, workspaceId: ctx.workspaceId, sessionId: ctx.sessionId };
}

const workspaceScope = { workspaceId: z.string().optional().describe("Workspace scope") };

const userApproved = {
  userApproved: z.boolean().optional().describe("Set true only after the user explicitly said yes (install policy is ask-by-default)"),
};
export const pluginsCreate: AgentTool<Record<string, unknown>> = {
  name: "plugins.create",
  description:
    "Create a new plugin (experience) that mounts in the dock. Only when dock.list and the store have nothing suitable. Validated against the design kit; agent origin needs { userApproved: true }. Same handler as POST /api/plugins/lifecycle and the CLI.",
  schema: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().min(1),
      code: z.string().min(1).describe("Single-file TSX/HTML; tokens only, no hardcoded colors, no gradients, no external URLs"),
      icon: z.string().optional(),
      workspaceId: z.string().optional(),
      ...userApproved,
    })
    .catchall(z.unknown()),
  execute: (args, ctx) => pluginLifecycle("create", args as Record<string, unknown>, actorCtx(ctx)),
};

export const pluginsEdit: AgentTool<Record<string, unknown>> = {
  name: "plugins.edit",
  description:
    "Edit a plugin in place: creates a new kept version (rollback available), never a duplicate. Same handler as POST /api/plugins/lifecycle and the CLI.",
  schema: z
    .object({
      id: z.string().min(1).describe("Plugin id to edit"),
      changeSummary: z.string().optional(),
      code: z.string().optional().describe("Full replacement code (validated against the design kit)"),
      patch: z.unknown().optional().describe("Targeted patch instead of full code"),
      workspaceId: z.string().optional(),
      ...userApproved,
    })
    .catchall(z.unknown()),
  execute: (args, ctx) => pluginLifecycle("modify", args as Record<string, unknown>, actorCtx(ctx)),
};

export const pluginsInstall: AgentTool<Record<string, unknown>> = {
  name: "plugins.install",
  description:
    "Install a store plugin into a workspace (or mount a local one). Store lookup first; agent origin needs { userApproved: true }. Same handler as POST /api/plugins/lifecycle and the CLI.",
  schema: z
    .object({
      pluginId: z.string().min(1),
      workspaceId: z.string().optional(),
      ...userApproved,
    })
    .catchall(z.unknown()),
  execute: (args, ctx) => pluginLifecycle("install", args as Record<string, unknown>, actorCtx(ctx)),
};

export const pluginsUninstall: AgentTool<{ pluginId: string; workspaceId?: string }> = {
  name: "plugins.uninstall",
  description:
    "Uninstall a plugin from a workspace (mount removed; code and versions are kept for reinstall or rollback). Refuses clearly when not installed. Same handler and the CLI.",
  schema: z.object({
    pluginId: z.string().min(1),
    workspaceId: z.string().optional(),
  }),
  execute: (args, ctx) => pluginLifecycle("uninstall", args as Record<string, unknown>, actorCtx(ctx)),
};

export const pluginsOperate: AgentTool<{ plugin: string; capability: string; input?: Record<string, unknown>; workspaceId?: string }> = {
  name: "plugins.operate",
  description:
    "Operate an installed plugin: invoke one of its capabilities (find the id via dock.list or the registry first; never guess). Same result and events as POST /api/plugins/:id/:capability and the CLI.",
  schema: z.object({
    plugin: z.string().min(1).describe("Plugin id (e.g. sources, search)"),
    capability: z.string().min(1).describe("Capability name (e.g. add, quest_add)"),
    input: z.record(z.string(), z.unknown()).default({}).describe("Capability input object"),
    workspaceId: z.string().optional().describe("Workspace scope"),
  }),
  execute: (args, ctx) =>
    invokeCapability(args.plugin, args.capability, args.input ?? {}, {
      ...actorCtx(ctx),
      workspaceId: args.workspaceId || ctx.workspaceId,
    }),
};

export const pluginsRollback: AgentTool<{ pluginId: string; version: string; workspaceId?: string }> = {
  name: "plugins.rollback",
  description:
    "Roll back a plugin to a kept version (new row with the old content; history is append-only). Same handler as POST /api/plugins/:id/rollback and the CLI.",
  schema: z.object({
    pluginId: z.string().min(1).describe("Plugin id"),
    version: z.string().min(1).describe("Kept version to restore"),
    workspaceId: z.string().optional(),
  }),
  execute: (args, ctx) => pluginRollback(args.pluginId, args.version, args.workspaceId || ctx.workspaceId),
};

export const pluginsActivate: AgentTool<{ pluginId: string }> = {
  name: "plugins.activate",
  description:
    "Activate an installed plugin: its capabilities return to the agent catalog, stored data untouched. Same handler as POST /api/plugins/:id/activate and the CLI.",
  schema: z.object({
    pluginId: z.string().min(1).describe("Installed plugin id"),
  }),
  execute: (args, ctx) => pluginSetActive(args.pluginId, true, actorCtx(ctx)),
};

export const pluginsDeactivate: AgentTool<{ pluginId: string }> = {
  name: "plugins.deactivate",
  description:
    "Deactivate an installed plugin: its capabilities leave the agent catalog, stored data kept for reactivation. Same handler as POST /api/plugins/:id/deactivate and the CLI.",
  schema: z.object({
    pluginId: z.string().min(1).describe("Installed plugin id"),
  }),
  execute: (args, ctx) => pluginSetActive(args.pluginId, false, actorCtx(ctx)),
};
