import { z } from "zod";
import type { AgentTool } from "../../types";
import { dockAction } from "../../../facade/shared";

function actorCtx(ctx: { workspaceId?: string; sessionId?: string }) {
  return { actor: "agent" as const, workspaceId: ctx.workspaceId, sessionId: ctx.sessionId };
}

const workspaceScope = { workspaceId: z.string().optional().describe("Workspace scope") };

export const dockOpen: AgentTool<{ tabId: string; workspaceId?: string; noteId?: string }> = {
  name: "dock.open",
  description:
    "Open a tab or plugin in the dock: it takes the screen or opens next to the chat. Everything the user sees is a plugin open in the dock — open it, never describe it. Same handler as POST /api/dock/action and the CLI.",
  schema: z.object({
    tabId: z.string().min(1).describe("Tab or plugin id to open"),
    noteId: z.string().min(1).optional().describe("Note id to select inside the Notes surface (tabId notes)"),
    ...workspaceScope,
  }),
  execute: (args, ctx) => dockAction("tabs.open", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockClose: AgentTool<{ id: string; workspaceId?: string }> = {
  name: "dock.close",
  description:
    "Close a dock tab from view. State is kept — reopening returns it as it was; nothing is deleted. Same handler as POST /api/dock/action and the CLI.",
  schema: z.object({
    id: z.string().min(1).describe("Tab or plugin id to close"),
    ...workspaceScope,
  }),
  execute: (args, ctx) => dockAction("tabs.close", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockPin: AgentTool<{ id: string; workspaceId?: string }> = {
  name: "dock.pin",
  description:
    "Pin a dock item so it stays one click away and comes back as it was across sessions. Same handler as POST /api/dock/action and the CLI.",
  schema: z.object({
    id: z.string().min(1).describe("Tab or plugin id to pin"),
    ...workspaceScope,
  }),
  execute: (args, ctx) => dockAction("tabs.pin", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockUnpin: AgentTool<{ id: string; workspaceId?: string }> = {
  name: "dock.unpin",
  description:
    "Unpin a dock item. It stays installed and searchable; unpinning never deletes anything. Same handler as POST /api/dock/action and the CLI.",
  schema: z.object({
    id: z.string().min(1).describe("Tab or plugin id to unpin"),
    ...workspaceScope,
  }),
  execute: (args, ctx) => dockAction("tabs.unpin", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockList: AgentTool<{ workspaceId?: string }> = {
  name: "dock.list",
  description:
    "List what the dock holds, with pinned flags. Start here: open what exists before installing, install before creating. Same handler as GET /api/dock/tabs and the CLI. Returns the single action registry (tabs.focus/next/prev/close/background, chat.toggle) with shortcuts.",
  schema: z.object({ ...workspaceScope }),
  execute: (args, ctx) => dockAction("tabs.list", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockFocus: AgentTool<{ index: number; workspaceId?: string }> = {
  name: "dock.focus",
  description:
    "Focus the nth open dock item in visual order. Same handler as POST /api/dock/action (tabs.focus) and the CLI.",
  schema: z.object({
    index: z.number().int().min(0).describe("Zero-based index into the visible dock order"),
    ...workspaceScope,
  }),
  execute: (args, ctx) => dockAction("tabs.focus", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockNext: AgentTool<{ workspaceId?: string }> = {
  name: "dock.next",
  description:
    "Focus the next dock item. Same handler as POST /api/dock/action (tabs.next) and the CLI.",
  schema: z.object({ ...workspaceScope }),
  execute: (args, ctx) => dockAction("tabs.next", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockPrev: AgentTool<{ workspaceId?: string }> = {
  name: "dock.prev",
  description:
    "Focus the previous dock item. Same handler as POST /api/dock/action (tabs.prev) and the CLI.",
  schema: z.object({ ...workspaceScope }),
  execute: (args, ctx) => dockAction("tabs.prev", args as Record<string, unknown>, actorCtx(ctx)),
};

export const dockBackground: AgentTool<{ id: string; workspaceId?: string }> = {
  name: "dock.background",
  description:
    "Move a dock item to background (keeps running, frees its panel). Same handler as POST /api/dock/action and the CLI.",
  schema: z.object({
    id: z.string().min(1).describe("Tab or plugin id to background"),
    ...workspaceScope,
  }),
  execute: (args, ctx) => dockAction("tabs.background", args as Record<string, unknown>, actorCtx(ctx)),
};

export const chatToggle: AgentTool<{ workspaceId?: string }> = {
  name: "chat.toggle",
  description:
    "Focus or toggle the chat panel. Same handler as POST /api/dock/action (chat.toggle) and the CLI.",
  schema: z.object({ ...workspaceScope }),
  execute: (args, ctx) => dockAction("chat.toggle", args as Record<string, unknown>, actorCtx(ctx)),
};

