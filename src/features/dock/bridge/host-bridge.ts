import type { HostBridgeOptions, HostBridgeRequest, HostBridgeResponse } from "../types";

/**
 * Source for the guest iframe window. A getter is preferred: the iframe only
 * renders after the srcdoc fetch resolves, so a window captured once at
 * bridge creation time is null forever. The getter resolves the live window
 * at message time from the iframe element instead.
 */
export type HostBridgeWindowSource = Window | null | (() => Window | null);

function resolveWindowSource(source: HostBridgeWindowSource): Window | null {
  if (typeof source === "function") {
    try {
      return source() ?? null;
    } catch {
      return null;
    }
  }
  return source;
}

/**
 * Creates a host-side postMessage bridge listener for a sandboxed dynamic tab iframe.
 *
 * Security model: the sandbox runs with `sandbox="allow-scripts"` and no
 * `allow-same-origin`, so the guest has an opaque origin — `event.origin`
 * cannot be checked. Source identity IS the check: only messages whose
 * `event.source` is the live iframe `contentWindow` are handled; everything
 * else (including messages arriving before the iframe exists) is ignored.
 */
export function createHostBridge(
  targetWindowOrGetter: HostBridgeWindowSource,
  options: HostBridgeOptions
) {
  const workspaceId = options.workspaceId || "global";
  const tabId = options.tabId || options.pluginId || "default";
  const effectiveScope = options.workspaceId || "global";
  const effectiveEntityId = options.pluginId || options.tabId || "default";
  const storagePrefix = options.storagePrefix || (options.workspaceId ? "polydocks" : "polymax");

  const buildStorageKey = (key?: string) => {
    return `${storagePrefix}:${effectiveScope}:${effectiveEntityId}:${key || ""}`;
  };

  const respond = (requestId: number, result?: unknown, error?: string) => {
    const target = resolveWindowSource(targetWindowOrGetter);
    if (!target) {
      // The iframe navigated away or unmounted between request and reply
      // (e.g. an async getContext/onInvoke crossing a srcdoc reload). Log at
      // debug level — this used to fail silently and strand guest promises.
      console.debug(
        `[polymax bridge] reply ${String(requestId)} dropped: guest window is gone`
      );
      return;
    }
    const response: HostBridgeResponse = {
      polymaxResponseId: requestId,
      result,
      error,
    };
    // targetOrigin "*" is required: the sandbox has an opaque origin, so no
    // narrower origin can be named. The payload stays limited to this
    // request's result — never host state, capabilities, or keys.
    target.postMessage(response, "*");
  };

  const handleMessage = async (event: MessageEvent): Promise<boolean> => {
    const target = resolveWindowSource(targetWindowOrGetter);
    // Opaque origin: source identity is the only check. With no live guest
    // window there is nothing to verify against, so ignore the message.
    if (!target || event.source !== target) {
      return false;
    }

    const data = event.data as HostBridgeRequest;
    if (!data || typeof data !== "object" || !data.polymaxAction) {
      return false;
    }

    const requestId = data.polymaxRequestId;

    try {
      switch (data.polymaxAction) {
        case "storage.get": {
          if (!data.key) {
            respond(requestId, null, "Missing storage key");
            return true;
          }
          const item = localStorage.getItem(buildStorageKey(data.key));
          respond(requestId, item ? JSON.parse(item) : null);
          return true;
        }

        case "storage.set": {
          if (!data.key) {
            respond(requestId, null, "Missing storage key");
            return true;
          }
          localStorage.setItem(buildStorageKey(data.key), JSON.stringify(data.value));
          respond(requestId, true);
          return true;
        }

        case "storage.remove": {
          if (!data.key) {
            respond(requestId, null, "Missing storage key");
            return true;
          }
          localStorage.removeItem(buildStorageKey(data.key));
          respond(requestId, true);
          return true;
        }

        case "getContext": {
          let ctx: Record<string, unknown> = {
            workspaceId: effectiveScope,
            tabId: effectiveEntityId,
            pluginId: options.pluginId,
            timestamp: new Date().toISOString(),
          };
          if (options.getContext) {
            const dynamicCtx = await options.getContext();
            ctx = { ...ctx, ...dynamicCtx };
          }
          respond(requestId, ctx);
          return true;
        }

        case "openUrl": {
          if (typeof data.url === "string") {
            const trimmed = data.url.trim();
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
              if (options.onOpenUrl) {
                options.onOpenUrl(trimmed);
              } else if (typeof window !== "undefined") {
                window.open(trimmed, "_blank", "noopener,noreferrer");
              }
              respond(requestId, true);
            } else {
              respond(requestId, null, "Forbidden URL protocol. Only HTTP/HTTPS permitted.");
            }
          } else {
            respond(requestId, null, "Invalid URL argument.");
          }
          return true;
        }

        case "openContent": {
          if (typeof data.url === "string") {
            const trimmed = data.url.trim();
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
              // Native Reader path: open article/video inside the app. Falls
              // back to the legacy Browser-tab handler when no Reader is wired.
              if (options.onOpenContent) {
                options.onOpenContent(trimmed);
              } else if (options.onOpenUrl) {
                options.onOpenUrl(trimmed);
              } else if (typeof window !== "undefined") {
                window.open(trimmed, "_blank", "noopener,noreferrer");
              }
              respond(requestId, true);
            } else {
              respond(requestId, null, "Forbidden URL protocol. Only HTTP/HTTPS permitted.");
            }
          } else {
            respond(requestId, null, "Invalid URL argument.");
          }
          return true;
        }

        case "submit": {
          if (typeof data.command === "string") {
            options.onSubmitCommand?.(data.command);
            respond(requestId, true);
          } else {
            respond(requestId, null, "Invalid command string.");
          }
          return true;
        }

        case "ui.expand": {
          options.onExpand?.();
          respond(requestId, true);
          return true;
        }

        case "ui.collapse": {
          options.onCollapse?.();
          respond(requestId, true);
          return true;
        }

        case "capability.invoke": {
          const capId = data.capabilityId as string;
          if (!capId) {
            respond(requestId, null, "Missing capabilityId for invoke.");
            return true;
          }

          if (
            options.allowedCapabilities &&
            !options.allowedCapabilities.includes(capId) &&
            !options.allowedCapabilities.includes("*")
          ) {
            respond(
              requestId,
              null,
              `Permission denied: Capability "${capId}" is not declared in this experience manifest.`
            );
            return true;
          }

          if (options.onInvoke) {
            const res = await options.onInvoke(capId, data.input);
            respond(requestId, res);
            return true;
          }

          // Fallback to fetch invocation endpoint
          try {
            const apiRes = await fetch("/api/capabilities/invoke", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ capabilityId: capId, input: data.input, workspaceId }),
            });
            const apiData = await apiRes.json();
            if (apiData.success) {
              respond(requestId, apiData.data);
            } else {
              respond(requestId, null, apiData.error || "Invocation failed");
            }
          } catch (invokeErr: any) {
            respond(requestId, null, invokeErr.message || "Failed to invoke capability");
          }
          return true;
        }

        case "runtime.ready":
        case "ui.ready": {
          options.onReady?.();
          // The guest awaits this reply as its handshake ack: it proves the
          // host is listening. A missing ack surfaces "bridge not responding".
          // The ack also carries the active theme so the sandbox renders the
          // same theme as the app from the first frame (no reload needed).
          respond(requestId, { ready: true, theme: options.getTheme?.() || "void" });
          return true;
        }

        case "theme.get": {
          respond(requestId, options.getTheme?.() || "void");
          return true;
        }

        case "task.start": {
          const label = typeof data.label === "string" ? data.label.trim().slice(0, 200) : "";
          if (!label) {
            respond(requestId, null, "task.start requires a label");
            return true;
          }
          const taskId =
            typeof data.taskId === "string" && data.taskId.trim()
              ? data.taskId.trim().slice(0, 120)
              : `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          options.onTaskEvent?.({
            type: "start",
            tabId,
            taskId,
            label,
            detail: typeof data.detail === "string" ? data.detail.slice(0, 500) : undefined,
          });
          respond(requestId, { id: taskId });
          return true;
        }

        case "task.update": {
          if (typeof data.taskId !== "string" || !data.taskId) {
            respond(requestId, null, "task.update requires a taskId");
            return true;
          }
          options.onTaskEvent?.({
            type: "update",
            tabId,
            taskId: data.taskId,
            detail: typeof data.detail === "string" ? data.detail.slice(0, 500) : undefined,
            status: data.status === "running" || data.status === "done" || data.status === "error" ? data.status : undefined,
          });
          respond(requestId, true);
          return true;
        }

        case "task.done": {
          if (typeof data.taskId !== "string" || !data.taskId) {
            respond(requestId, null, "task.done requires a taskId");
            return true;
          }
          options.onTaskEvent?.({
            type: "done",
            tabId,
            taskId: data.taskId,
            detail: typeof data.detail === "string" ? data.detail.slice(0, 500) : undefined,
            status: data.status === "error" ? "error" : "done",
          });
          respond(requestId, true);
          return true;
        }

        case "runtime.error": {
          options.onError?.(data.error);

          // Report to backend error collector
          if (typeof fetch !== "undefined") {
            fetch(`/api/experiences/${encodeURIComponent(tabId)}/errors`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspaceId, error: data.error }),
            }).catch(() => {});
          }
          return true;
        }

        default:
          respond(requestId, null, `Unknown bridge action "${data.polymaxAction}"`);
          return true;
      }
    } catch (err: any) {
      respond(requestId, null, err?.message || String(err));
      return true;
    }
  };

  const listener = (event: MessageEvent) => {
    handleMessage(event);
  };

  if (typeof window !== "undefined") {
    window.addEventListener("message", listener);
  }

  return {
    handleMessage,
    /**
     * Pushes a theme change into the guest so the sandbox follows the app
     * theme without a reload. No-op when the guest window is gone.
     */
    pushTheme: (theme: string) => {
      const target = resolveWindowSource(targetWindowOrGetter);
      if (!target) return;
      target.postMessage({ polymaxTheme: theme }, "*");
    },
    destroy: () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("message", listener);
      }
    },
  };
}
