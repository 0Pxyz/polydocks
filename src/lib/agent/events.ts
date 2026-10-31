/**
 * Maps backend contracts (which use "tab" and "tray")
 * to the Polymax UI architecture ("dock" and "experience").
 * Strictly enforces that no UI components handle raw backend vocabulary.
 */

export interface ExperienceManifest {
  id: string;
  title: string;
  icon?: string;
  scope?: string;
}

export interface ApprovalRequest {
  toolName: string;
  experienceId: string;
  message: string;
}

export type UIEvent =
  | {
      type: "agent.started";
      step: number;
      prompt: string;
      cityId?: string;
      /** Effective model handling this turn (may differ from the selected one). */
      model?: string;
      /** Deterministic intent the turn was routed under. */
      intent?: string;
    }
  | {
      type: "tool.started";
      step: number;
      id: string;
      name: string;
      statusLabel?: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool.completed";
      step: number;
      id: string;
      name: string;
      result: unknown;
    }
  | {
      type: "experience.created";
      step: number;
      experience: ExperienceManifest;
    }
  | {
      type: "dock.open_experience";
      step: number;
      experienceId: string;
    }
  | {
      type: "dock.layout";
      step: number;
      op: "open" | "close" | "pin" | "unpin";
      itemId: string;
      success: boolean;
      message?: string;
    }
  | {
      type: "experience.primed";
      step: number;
      experienceId: string;
      url?: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "map.changed";
      step: number;
      mapId: string;
      name?: string;
    }
  | {
      type: "map.point.added";
      step: number;
      cityId: string;
      title: string;
      x: number;
      y: number;
      mapId: string;
    }
  | {
      type: "plugin.created";
      step: number;
      plugin: ExperienceManifest;
      workspaceId?: string;
    }
  | {
      type: "plugin.updated";
      step: number;
      plugin: ExperienceManifest;
      workspaceId?: string;
    }
  | {
      type: "plugin.published";
      step: number;
      plugin: ExperienceManifest;
    }
  | {
      type: "plugin.operated";
      step: number;
      pluginId: string;
      action?: string;
    }
  | {
      type: "theme.applied";
      step: number;
      applied: Record<string, unknown>;
      attachmentId?: string;
    }
  | {
      type: "reader.open";
      step: number;
      /** Source id (for quest promotion). */
      id?: string;
      /** URL (external fallback only; in-UI modes never auto-open tabs). */
      url: string;
      title?: string;
      cityId?: string;
      site?: string;
      image?: string | null;
      /** Open mode decided server-side. */
      mode?: "video" | "reader" | "embed" | "external";
      markdown?: string;
      embedUrl?: string;
      reason?: string;
    }
  | {
      type: "source.added";
      step: number;
      source: Record<string, unknown>;
    }
  | {
      type: "approval.required";
      step: number;
      approval: ApprovalRequest;
    }
  | {
      type: "agent.finished";
      step: number;
      text: string;
      steps: number;
      model?: string;
      intent?: string;
    }
  | {
      type: "agent.error";
      step: number;
      code?: string;
      message: string;
    }
  | {
      type: "agent.heartbeat";
      step: number;
      /** Ms since the turn started (server clock). */
      elapsedMs: number;
      /** What the loop is waiting on. Never carries content. */
      phase: "thinking" | "running_tool";
      /** Machine tool name while running_tool, if any. */
      tool?: string;
    }
  | {
      type: "agent.text_delta";
      step: number;
      /** One streamed text fragment (append to the provisional reply). */
      delta: string;
    }
  | {
      type: "city.entered";
      step: number;
      /** City workspace id to switch the view into. */
      cityId: string;
    };

/**
 * Tools powered by TinyFish web discovery. Only these show TinyFish branding.
 */
export const TINYFISH_TOOLS = ["search_web", "fetch_page"] as const;
export type TinyFishTool = (typeof TINYFISH_TOOLS)[number];

/** Local copy of the TinyFish mark (public/tinyfish-logo.png). */
export const TINYFISH_LOGO_SRC = "/tinyfish-logo.png";

export function isTinyFishTool(toolName: string): boolean {
  return (TINYFISH_TOOLS as readonly string[]).includes(toolName);
}

export interface ToolBrand {
  logoSrc: string;
  label: string;
}

/**
 * Generic brand registry: any tool with a registered mark shows it through
 * the same UI path (thought stream today, chat tomorrow). Adding a new
 * integration is one entry here — no UI code changes, no per-vendor checks
 * at render time.
 */
const TOOL_BRANDS: Record<string, ToolBrand> = {
  search_web: { logoSrc: TINYFISH_LOGO_SRC, label: "TinyFish" },
  fetch_page: { logoSrc: TINYFISH_LOGO_SRC, label: "TinyFish" },
  "search.web": { logoSrc: TINYFISH_LOGO_SRC, label: "TinyFish" },
  "search.fetch": { logoSrc: TINYFISH_LOGO_SRC, label: "TinyFish" },
};

/** Brand mark for a tool, or null when it has none. */
export function getToolBrand(toolName?: string | null): ToolBrand | null {
  if (!toolName) return null;
  return TOOL_BRANDS[toolName] ?? null;
}

/**
 * Brand fallback by label text, driven by the same registry: matches when
 * the status line names a registered brand (e.g. a capability path whose
 * tool name differs from the integration). No per-vendor checks at render.
 */
export function getToolBrandByLabel(text?: string | null): ToolBrand | null {
  if (!text) return null;
  for (const brand of Object.values(TOOL_BRANDS)) {
    if (brand.label && text.includes(brand.label)) return brand;
  }
  return null;
}

/**
 * Human-friendly status line mapping for substantive tools.
 * Internal bookkeeping, inspections, and instant queries return null to suppress noisy progress updates.
 */
export function getFriendlyToolStatus(toolName: string, args?: Record<string, unknown>): string | null {
  switch (toolName) {
    case "search_web": {
      const q = typeof args?.query === "string" ? args.query : "";
      return q ? `Searching the web via TinyFish for "${q}"…` : "Searching the web via TinyFish…";
    }
    case "fetch_page":
      return "Reading primary sources via TinyFish…";
    case "create_tab": {
      const title = typeof args?.title === "string" ? args.title : "";
      return title ? `Building "${title}"…` : "Building the interactive experience…";
    }
    case "create_plugin": {
      const name = typeof args?.name === "string" ? args.name : "";
      return name ? `Building tool "${name}"…` : "Building the tool…";
    }
    case "modify_plugin":
      return "Updating the tool…";
    case "operate_plugin": {
      const action = typeof args?.action === "string" ? args.action : "";
      return action ? `Running "${action}"…` : "Running the tool…";
    }
    case "sandbox_exec": {
      const command = typeof args?.command === "string" ? args.command : "";
      return command ? `Running \`${command.slice(0, 60)}\` in the sandbox…` : "Running in the sandbox…";
    }
    case "sandbox_write_file": {
      const p = typeof args?.path === "string" ? args.path : "";
      return p ? `Writing ${p} in the sandbox…` : "Writing in the sandbox…";
    }
    case "sandbox_serve":
      return "Starting the preview server…";
    case "sandbox_read_file":
    case "sandbox_list_files":
    case "sandbox_logs":
      return "Reading the sandbox…";
    case "sandbox_status":
    case "sandbox_terminate":
      return null;
    case "apply_theme":
      return "Applying theme…";
    case "publish_plugin":
    case "promote_to_plugin":
      return "Publishing the tool…";
    case "update_tab":
      return "Updating the interactive experience…";
    case "delete_tab": {
      const id = typeof args?.id === "string" ? args.id : "";
      return id ? `Removing experience "${id}"…` : "Removing experience…";
    }
    case "read_city_file":
    case "read_file":
    case "read_file_safe":
      return "Reading your notes…";
    case "write_city_file":
    case "write_file":
    case "write_file_safe":
    case "edit_file":
      return "Writing your notes…";
    case "plan_map":
      return "Planning knowledge territories on the world map…";
    case "build_city": {
      const topic = typeof args?.topic === "string" ? args.topic : "";
      return topic ? `Constructing and researching "${topic}"…` : "Constructing learning environment & quests…";
    }
    case "open_tab":
    case "open_intent": {
      const tabId = typeof args?.tabId === "string" ? args.tabId : typeof args?.id === "string" ? args.id : "";
      return tabId ? `Opening ${tabId}…` : "Opening experience in workspace…";
    }
    case "dock_pin":
    case "dock_unpin":
    case "dock_close": {
      const id = typeof args?.id === "string" ? args.id : "";
      if (toolName === "dock_pin") return id ? `Pinning ${id}…` : "Pinning to the dock…";
      if (toolName === "dock_unpin") return id ? `Unpinning ${id}…` : "Unpinning from the dock…";
      return id ? `Closing ${id}…` : "Closing…";
    }
    // Trivial bookkeeping, internal inspections, and instant queries are silent
    case "list_tabs":
    case "inspect_tab":
    case "get_city_context":
    case "close_tray":
    case "list_maps":
    case "set_map":
    case "place_city":
    case "open_source":
    case "find_capabilities":
    case "inspect_experience":
    case "inspect_execution":
    case "list_recent_executions":
    case "list_files":
    case "search_files":
    case "recall_memory":
    case "record_memory":
      return null;
    case "invoke_capability": {
      // Same integrations as their direct tools (search.web == search_web):
      // surface the same line so capability-routed turns read identically.
      const cap = typeof args?.id === "string" ? args.id : "";
      const inner = (args?.input ?? {}) as Record<string, unknown>;
      if (cap === "search.web") {
        const q = typeof inner.query === "string" ? inner.query : "";
        return q ? `Searching the web via TinyFish for "${q}"…` : "Searching the web via TinyFish…";
      }
      if (cap === "search.fetch") {
        return "Reading primary sources via TinyFish…";
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Adapts raw SSE event from server to normalized UIEvent.
 */
export function adaptBackendEvent(raw: {
  type: string;
  step?: number;
  payload?: Record<string, any>;
}): UIEvent | null {
  const step = raw.step ?? 0;
  const payload = raw.payload || {};

  switch (raw.type) {
    case "agent.start":
      return {
        type: "agent.started",
        step,
        prompt: String(payload.prompt || ""),
        cityId: payload.cityId ? String(payload.cityId) : undefined,
        model: payload.model ? String(payload.model) : undefined,
        intent: payload.intent ? String(payload.intent) : undefined,
      };

    case "tool.start": {
      const toolName = String(payload.name || "");
      const args = (payload.arguments || {}) as Record<string, unknown>;
      const status = getFriendlyToolStatus(toolName, args);
      return {
        type: "tool.started",
        step,
        id: String(payload.id || ""),
        name: toolName,
        statusLabel: status || undefined,
        args,
      };
    }

    case "tool.done": {
      const toolName = String(payload.name || "");
      const result = payload.result;

      // Check if delete_tab requires user confirmation
      if (
        toolName === "delete_tab" &&
        result &&
        typeof result === "object" &&
        (result as any).requiresConfirmation
      ) {
        return {
          type: "approval.required",
          step,
          approval: {
            toolName: "delete_tab",
            experienceId: String((payload.result as any).tabId || (payload.arguments as any)?.id || "experience"),
            message: String(
              (payload.result as any).message || "The agent wants to delete this experience. Allow or Cancel?"
            ),
          },
        };
      }

      return {
        type: "tool.completed",
        step,
        id: String(payload.id || ""),
        name: toolName,
        result,
      };
    }

    case "tab.created":
      return {
        type: "experience.created",
        step,
        experience: {
          id: String(payload.id || ""),
          title: String(payload.title || "New Experience"),
          icon: payload.icon ? String(payload.icon) : undefined,
          scope: payload.scope ? String(payload.scope) : undefined,
        },
      };

    case "tray.open":
      return {
        type: "dock.open_experience",
        step,
        experienceId: String(payload.tabId || payload.id || ""),
      };

    case "dock.layout": {
      const op = String(payload.action || "").replace("dock.", "");
      if (op !== "open" && op !== "close" && op !== "pin" && op !== "unpin") {
        return null;
      }
      return {
        type: "dock.layout",
        step,
        op,
        itemId: String(payload.id || ""),
        success: payload.success !== false,
        message: typeof payload.message === "string" ? payload.message : undefined,
      };
    }

    case "tab.prime":
      return {
        type: "experience.primed",
        step,
        experienceId: String(payload.tabId || payload.id || ""),
        url: payload.url ? String(payload.url) : undefined,
        payload: (payload.payload as Record<string, unknown>) || undefined,
      };

    case "plugin.created":
    case "plugin.updated":
      return {
        type: raw.type as "plugin.created" | "plugin.updated",
        step,
        plugin: {
          id: String(payload.pluginId || payload.id || ""),
          title: String(payload.name || payload.title || payload.pluginId || "New Tool"),
          icon: payload.icon ? String(payload.icon) : undefined,
          scope: payload.workspaceId ? String(payload.workspaceId) : undefined,
        },
        workspaceId: payload.workspaceId ? String(payload.workspaceId) : undefined,
      };

    case "plugin.published":
      return {
        type: "plugin.published",
        step,
        plugin: {
          id: String(payload.pluginId || payload.id || ""),
          title: String(payload.name || payload.title || payload.pluginId || "New Tool"),
          icon: payload.icon ? String(payload.icon) : undefined,
        },
      };

    case "plugin.operated":
      return {
        type: "plugin.operated",
        step,
        pluginId: String(payload.pluginId || ""),
        action: payload.action ? String(payload.action) : undefined,
      };

    case "theme.apply": {
      const applied =
        payload.applied && typeof payload.applied === "object"
          ? (payload.applied as Record<string, unknown>)
          : {};
      return {
        type: "theme.applied",
        step,
        applied,
        attachmentId: payload.attachmentId ? String(payload.attachmentId) : undefined,
      };
    }

    case "map.changed":
      return {
        type: "map.changed",
        step,
        mapId: String(payload.mapId || ""),
        name: payload.name ? String(payload.name) : undefined,
      };

    case "map.point.added":
      return {
        type: "map.point.added",
        step,
        cityId: String(payload.cityId || ""),
        title: String(payload.title || ""),
        x: Number(payload.x || 0),
        y: Number(payload.y || 0),
        mapId: String(payload.mapId || ""),
      };

    case "agent.finish":
      return {
        type: "agent.finished",
        step,
        text: String(payload.text || ""),
        steps: Number(payload.steps || step),
        model: payload.model ? String(payload.model) : undefined,
        intent: payload.intent ? String(payload.intent) : undefined,
      };

    case "agent.heartbeat":
      return {
        type: "agent.heartbeat",
        step,
        elapsedMs: Number(payload.elapsedMs || 0),
        phase: payload.phase === "running_tool" ? "running_tool" : "thinking",
        tool: typeof payload.tool === "string" ? payload.tool : undefined,
      };

    case "agent.text_delta":
      return {
        type: "agent.text_delta",
        step,
        delta: typeof payload.delta === "string" ? payload.delta : "",
      };

    case "city.enter":
      return {
        type: "city.entered",
        step,
        cityId: String(payload.cityId || ""),
      };

    case "reader.open": {
      const url = typeof payload.url === "string" ? payload.url : "";
      if (!url) return null;
      const pick = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : undefined);
      const mode = payload.mode;
      return {
        type: "reader.open",
        step,
        url,
        id: pick("id"),
        title: pick("title"),
        cityId: pick("cityId"),
        site: pick("site"),
        image: (payload.image as string | null) ?? undefined,
        mode: mode === "video" || mode === "reader" || mode === "embed" || mode === "external" ? mode : undefined,
        markdown: pick("markdown"),
        embedUrl: pick("embedUrl"),
        reason: pick("reason"),
      };
    }

    case "browser.open": {
      const url = typeof payload.url === "string" ? payload.url : "";
      if (!url) return null;
      return {
        type: "reader.open",
        step,
        url,
        id: undefined,
        title: typeof payload.title === "string" ? payload.title : undefined,
        cityId: typeof payload.cityId === "string" ? payload.cityId : undefined,
        site: undefined,
        image: undefined,
        mode: undefined,
        markdown: undefined,
        embedUrl: undefined,
        reason: undefined,
      };
    }

    case "sandbox.preview": {
      const url = typeof payload.previewUrl === "string" ? payload.previewUrl : "";
      if (!url) return null;
      return {
        type: "reader.open",
        step,
        url,
        id: undefined,
        title:
          typeof payload.port !== "undefined"
            ? `Sandbox preview :${String(payload.port)}`
            : "Sandbox preview",
        cityId: undefined,
        site: undefined,
        image: undefined,
        mode: undefined,
        markdown: undefined,
        embedUrl: undefined,
        reason: undefined,
      };
    }

    case "source.added":
      return {
        type: "source.added",
        step,
        source: payload,
      };
    case "error":
      return {
        type: "agent.error",
        step,
        code: payload.code ? String(payload.code) : undefined,
        message:
          payload.code === "model_unauthorized"
            ? "Model access isn't set up. Check your API key."
            : String(payload.message || "An unexpected error occurred."),
      };

    default:
      return null;
  }
}
