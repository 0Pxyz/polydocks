import { generateMapLayout } from "@/lib/mapgen/proceduralWorld";
import type { MapSpec } from "../types";

export interface WorkerLayoutRequest {
  type: "GENERATE_LAYOUT";
  spec: MapSpec;
  requestId: string;
}

export interface WorkerLayoutResponse {
  type: "LAYOUT_GENERATED";
  layout: ReturnType<typeof generateMapLayout>;
  requestId: string;
}

export interface WorkerLayoutError {
  type: "LAYOUT_ERROR";
  error: string;
  requestId: string;
}

self.onmessage = (event: MessageEvent<WorkerLayoutRequest>) => {
  const { type, spec, requestId } = event.data;
  if (type === "GENERATE_LAYOUT") {
    try {
      const layout = generateMapLayout(spec);
      const response: WorkerLayoutResponse = {
        type: "LAYOUT_GENERATED",
        layout,
        requestId,
      };
      self.postMessage(response);
    } catch (err: unknown) {
      const errorResponse: WorkerLayoutError = {
        type: "LAYOUT_ERROR",
        error: err instanceof Error ? err.message : String(err),
        requestId,
      };
      self.postMessage(errorResponse);
    }
  }
};
