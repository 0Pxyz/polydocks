import { z } from "zod";
import type { AgentTool } from "../../types";
import { dockAction } from "../../../facade/shared";

function actorCtx(ctx: { cityId?: string; workspaceId?: string; sessionId?: string }) {
  return { actor: "agent" as const, cityId: ctx.cityId, workspaceId: ctx.workspaceId, sessionId: ctx.sessionId };
}

const cityScope = { cityId: z.string().optional().describe("City workspace scope") };

export const dockOpen: AgentTool<{ tabId: string; cityId?: string }> = {
  name: "dock.open",
  description:
    "Open a tab or plugin in the dock: it takes the screen or opens next to the chat. Everything the user sees is a plugin open in the dock — open it, never describe it. Same handler as POST /api/dock/action and the CLI.",
  schema: z.object({
    tabId: z.string().min(1).describe("Tab or plugin id to open"),
    ...cityScope,
  }),
  execute: (args, ctx) => dockAction("tabs.open", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockClose: AgentTool<{ id: string; cityId?: string }> = {
  name: "dock.close",
  description:
    "Close a dock tab from view. State is kept — reopening returns it as it was; nothing is deleted. Same handler as POST /api/dock/action and the CLI.",
  schema: z.object({
    id: z.string().min(1).describe("Tab or plugin id to close"),
    ...cityScope,
  }),
  execute: (args, ctx) => dockAction("tabs.close", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockPin: AgentTool<{ id: string; cityId?: string }> = {
  name: "dock.pin",
  description:
    "Pin a dock item so it stays one click away and comes back as it was across sessions. Same handler as POST /api/dock/action and the CLI.",
  schema: z.object({
    id: z.string().min(1).describe("Tab or plugin id to pin"),
    ...cityScope,
  }),
  execute: (args, ctx) => dockAction("tabs.pin", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockUnpin: AgentTool<{ id: string; cityId?: string }> = {
  name: "dock.unpin",
  description:
    "Unpin a dock item. It stays installed and searchable; unpinning never deletes anything. Same handler as POST /api/dock/action and the CLI.",
  schema: z.object({
    id: z.string().min(1).describe("Tab or plugin id to unpin"),
    ...cityScope,
  }),
  execute: (args, ctx) => dockAction("tabs.unpin", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockList: AgentTool<{ cityId?: string }> = {
  name: "dock.list",
  description:
    "List what the dock holds, with pinned flags. Start here: open what exists before installing, install before creating. Same handler as GET /api/dock/tabs and the CLI.",
  schema: z.object({ ...cityScope }),
  execute: (args, ctx) => dockAction("tabs.list", args as Record<string, unknown>, actorCtx(ctx)),
};

