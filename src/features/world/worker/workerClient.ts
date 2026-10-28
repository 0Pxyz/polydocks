import { generateMapLayout } from "@/lib/mapgen/proceduralWorld";
import type { MapLayout, MapSpec } from "../types";
import type { WorkerLayoutError, WorkerLayoutResponse } from "./mapWorker";

let workerInstance: Worker | null = null;
let requestCounter = 0;
const pendingRequests = new Map<
  string,
  {
    resolve: (layout: MapLayout) => void;
    reject: (error: Error) => void;
  }
>();

function getWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null;
  }

  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL("./mapWorker.ts", import.meta.url), {
        type: "module",
      });

      workerInstance.onmessage = (
        event: MessageEvent<WorkerLayoutResponse | WorkerLayoutError>
      ) => {
        const { type, requestId } = event.data;
        const pending = pendingRequests.get(requestId);
        if (!pending) return;

        pendingRequests.delete(requestId);
        if (type === "LAYOUT_GENERATED") {
          pending.resolve(event.data.layout);
        } else if (type === "LAYOUT_ERROR") {
          pending.reject(new Error(event.data.error));
        }
      };

      workerInstance.onerror = (err) => {
        console.error("[MapWorker] Worker error:", err);
      };
    } catch {
      workerInstance = null;
    }
  }

  return workerInstance;
}

/**
 * Requests map layout calculation asynchronously.
 * Offloads compute to Web Worker when available in browser,
 * or runs synchronously in Node / test environments.
 */
export async function requestMapLayout(spec: MapSpec): Promise<MapLayout> {
  const worker = getWorker();
  if (!worker) {
    // Headless / fallback synchronous generation
    return Promise.resolve(generateMapLayout(spec));
  }

  return new Promise((resolve, reject) => {
    const requestId = `req_${++requestCounter}_${Date.now()}`;
    pendingRequests.set(requestId, { resolve, reject });

    worker.postMessage({
      type: "GENERATE_LAYOUT",
      spec,
      requestId,
    });
  });
}
