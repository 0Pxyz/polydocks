import { z } from "zod";
import type { AgentTool } from "./types";
import { capabilityBus } from "../../plugins/bus";

export const open_source: AgentTool<{ url: string; title?: string }> = {
  name: "open_source",
  description: "Shows a URL in the Browser tab. Use to display a link; it fetches no text (use fetch_page) and primes no study state (use open_intent).",
  schema: z.object({
    url: z.string().url().describe("Valid HTTP or HTTPS URL to open"),
    title: z.string().optional().describe("Optional title for tab display"),
  }),
  execute: async (args, ctx) => {
    // Thin alias over the canonical browser.open capability so the same
    // policy, audit and browser.open event fire on every surface.
    const { initializeFirstPartyPlugins } = await import("../../plugins/first-party/index");
    initializeFirstPartyPlugins();
    const targetWorkspace = (ctx as any)?.workspaceId;
    const result = await capabilityBus.invoke("browser.open", {
      url: args.url,
      title: args.title || args.url,
    }, {
      actor: "agent",
      workspaceId: targetWorkspace,
      step: (ctx as any)?.step,
    });
    if (!result.success) {
      return {
        success: false,
        url: args.url,
        title: args.title,
        error: result.error,
      };
    }
    const data = result.data as any;
    return {
      success: true,
      url: (data as any)?.url || args.url,
      title: (data as any)?.title || args.title,
      action: "browser.open",
    };
  },
};
