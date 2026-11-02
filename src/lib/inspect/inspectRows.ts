/**
 * Inspect row contract (#181).
 *
 * Pure, UI-agnostic mapping from raw SSE events to the rows the Inspect
 * plugin renders: request → dispatcher decision → action → result/error.
 * Real runtime events only — unknown types map to null (never fabricated),
 * and rows carry shapes, never secrets: tool argument VALUES, prompt text,
 * and full URLs are dropped at this layer, so no view can leak them.
 * Empty input yields zero rows (honest empty states, enforced by test).
 */

export type InspectRowKind = "request" | "decision" | "action" | "result" | "error";

export interface InspectRow {
  seq: number;
  kind: InspectRowKind;
  /** Short human label (tool name, event name). Values never included. */
  label: string;
  /** Shape-only detail: counts, key names, hostnames, timing hints. */
  detail: string;
  step: number;
  deterministic?: boolean;
}

export interface RawInspectEvent {
  type: string;
  step?: number;
  payload?: Record<string, any>;
}

const MAX_DETAIL = 200;

function truncate(s: string): string {
  return s.length > MAX_DETAIL ? `${s.slice(0, MAX_DETAIL)}…` : s;
}

/** Hostname only — query strings and tokens never reach a row. */
function hostOf(url: unknown): string {
  if (typeof url !== "string" || url.length === 0) return "";
  try {
    return new URL(url).hostname || "invalid-url";
  } catch {
    return "invalid-url";
  }
}

/**
 * Maps one raw SSE event to an Inspect row, or null when the event is
 * not Inspectable. Never echoes argument values, prompt text, or URLs.
 */
export function summarizeInspectEvent(raw: RawInspectEvent, seq: number): InspectRow | null {
  const step = raw.step ?? 0;
  const payload = raw.payload ?? {};
  switch (raw.type) {
    case "agent.start": {
      const promptLen = typeof payload.prompt === "string" ? payload.prompt.length : 0;
      const model = typeof payload.model === "string" && payload.model ? `, model ${payload.model}` : "";
      const intent = typeof payload.intent === "string" && payload.intent ? `, intent ${payload.intent}` : "";
      return { seq, kind: "request", label: "Request", detail: `prompt ${promptLen} chars${model}${intent}`, step };
    }
    case "tool.start": {
      const name = String(payload.name ?? "unknown tool");
      const deterministic = payload.deterministic === true;
      if (deterministic) {
        const reason = typeof payload.reason === "string" && payload.reason ? `: ${payload.reason}` : "";
        return { seq, kind: "decision", label: `${name} (fast path)`, detail: truncate(`no model call${reason}`), step, deterministic: true };
      }
      const args = payload.arguments;
      const keys = args && typeof args === "object" ? Object.keys(args) : [];
      return { seq, kind: "action", label: name, detail: keys.length > 0 ? `args: ${keys.join(", ")}` : "no args", step };
    }
    case "tool.done": {
      const name = String(payload.name ?? "unknown tool");
      const result = payload.result;
      const failed = result && typeof result === "object" && (result as any).ok === false;
      const err = failed ? String((result as any).error ?? "failed") : "";
      return { seq, kind: "result", label: `${name} done`, detail: truncate(failed ? `failed: ${err}` : "ok"), step };
    }
    case "agent.finish": {
      const textLen = typeof payload.text === "string" ? payload.text.length : 0;
      const issues = Array.isArray((payload as any).receiptCheck?.issues) ? (payload as any).receiptCheck.issues.length : 0;
      return { seq, kind: "result", label: "Finished", detail: `answer ${textLen} chars${issues > 0 ? ", verify-before-relying" : ""}`, step };
    }
    case "browser.open": {
      const host = hostOf((payload as any).url);
      return { seq, kind: "action", label: "Browser open", detail: host ? `host ${host}` : "no url", step };
    }
    case "error": {
      const message = typeof payload.message === "string" ? payload.message : "unknown error";
      return { seq, kind: "error", label: "Error", detail: truncate(message), step };
    }
    default: {
      if (raw.type.startsWith("plugin.")) {
        return { seq, kind: "action", label: raw.type, detail: typeof payload.pluginId === "string" ? `plugin ${payload.pluginId}` : "", step };
      }
      return null;
    }
  }
}

/** Folds a raw event stream into Inspect rows, dropping the rest. */
export function buildInspectRows(events: RawInspectEvent[]): InspectRow[] {
  return events
    .map((event, index) => summarizeInspectEvent(event, index))
    .filter((row): row is InspectRow => row !== null);
}
