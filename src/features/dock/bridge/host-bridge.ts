import type { HostBridgeOptions, HostBridgeRequest, HostBridgeResponse } from "../types";

/**
 * Creates a host-side postMessage bridge listener for a sandboxed dynamic tab iframe.
 */
export function createHostBridge(
  targetWindow: Window | null,
  options: HostBridgeOptions
) {
  const cityId = options.cityId || options.workspaceId || "global";
  const tabId = options.tabId || options.pluginId || "default";
  const effectiveScope = options.workspaceId || options.cityId || "global";
  const effectiveEntityId = options.pluginId || options.tabId || "default";
  const storagePrefix = options.storagePrefix || (options.workspaceId ? "polydocks" : "polymax");

  const buildStorageKey = (key?: string) => {
    return `${storagePrefix}:${effectiveScope}:${effectiveEntityId}:${key || ""}`;
  };

  const respond = (requestId: number, result?: unknown, error?: string) => {
    if (!targetWindow) return;
    const response: HostBridgeResponse = {
      polymaxResponseId: requestId,
      result,
      error,
    };
    targetWindow.postMessage(response, "*");
  };

  const handleMessage = async (event: MessageEvent): Promise<boolean> => {
    // Ensure the message originated from our target iframe window if specified
    if (targetWindow && event.source !== targetWindow) {
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
            cityId: effectiveScope,
            tabId: effectiveEntityId,
            workspaceId: options.workspaceId,
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
              body: JSON.stringify({ capabilityId: capId, input: data.input, cityId }),
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
              body: JSON.stringify({ cityId, error: data.error }),
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
    destroy: () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("message", listener);
      }
    },
  };
}
