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
      statusLabel: string;
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
      message: string;
    };

/**
 * Human-friendly status line mapping for all 12 canonical tools.
 */
export function getFriendlyToolStatus(toolName: string, args?: Record<string, unknown>): string {
  switch (toolName) {
    case "search_web": {
      const q = typeof args?.query === "string" ? args.query : "";
      return q ? `Searching the web for "${q}"…` : "Searching the web for primary sources…";
    }
    case "fetch_page":
      return "Reading article content…";
    case "create_tab": {
      const title = typeof args?.title === "string" ? args.title : "";
      return title ? `Building "${title}" experience…` : "Building new experience…";
    }
    case "update_tab":
      return "Updating dynamic experience…";
    case "delete_tab": {
      const id = typeof args?.id === "string" ? args.id : "";
      return id ? `Removing experience "${id}"…` : "Removing experience…";
    }
    case "list_tabs":
      return "Checking available dock experiences…";
    case "open_tab":
      return "Opening experience in workspace…";
    case "close_tray":
      return "Minimizing workspace surface…";
    case "get_city_context":
      return "Loading city knowledge base…";
    case "read_city_file":
      return "Inspecting workspace document…";
    case "write_city_file":
      return "Writing workspace knowledge…";
    case "open_source":
      return "Opening curated source…";
    default:
      return `Working with ${toolName}…`;
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
      return {
        type: "tool.started",
        step,
        id: String(payload.id || ""),
        name: toolName,
        statusLabel: getFriendlyToolStatus(toolName, args),
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
        experienceId: String(payload.id || ""),
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
        message: String(payload.message || "An unexpected error occurred."),
      };

    default:
      return null;
  }
}
