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
      type: "approval.required";
      step: number;
      approval: ApprovalRequest;
    }
  | {
      type: "agent.finished";
      step: number;
      text: string;
      steps: number;
    }
  | {
      type: "agent.error";
      step: number;
      code?: string;
      message: string;
    };

/**
 * Human-friendly status line mapping for substantive tools.
 * Internal bookkeeping, inspections, and instant queries return null to suppress noisy progress updates.
 */
export function getFriendlyToolStatus(toolName: string, args?: Record<string, unknown>): string | null {
  switch (toolName) {
    case "search_web": {
      const q = typeof args?.query === "string" ? args.query : "";
      return q ? `Searching the web for "${q}"…` : "Searching the web…";
    }
    case "fetch_page":
      return "Reading primary sources…";
    case "create_tab": {
      const title = typeof args?.title === "string" ? args.title : "";
      return title ? `Building "${title}"…` : "Building the interactive experience…";
    }
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
    case "invoke_capability":
    case "inspect_experience":
    case "inspect_execution":
    case "list_recent_executions":
    case "list_files":
    case "search_files":
    case "recall_memory":
    case "record_memory":
    case "create_plugin":
    case "modify_plugin":
    case "operate_plugin":
    case "publish_plugin":
    case "promote_to_plugin":
      return null;
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

    case "tab.prime":
      return {
        type: "experience.primed",
        step,
        experienceId: String(payload.tabId || payload.id || ""),
        url: payload.url ? String(payload.url) : undefined,
        payload: (payload.payload as Record<string, unknown>) || undefined,
      };

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
