import { z } from "zod";
import type { AgentTool } from "./tools/types";

/**
 * Responses API adapter for the heavy agent loop (#221).
 *
 * The heavy agent runs over Responses (`client.responses.create`), not Chat
 * Completions: only Responses preserves reasoning across turns and enables
 * native `tool_search` / built-in `web_search` (#222, #223). Chat
 * Completions stays as the fallback for clients without a `responses`
 * surface (unit-test doubles, eval scripted LLM, openweight endpoints).
 *
 * Preserved through the migration (see #155, #167, #180, #207):
 * - memory injection, guidelines extract, thread compaction, taskRunner,
 *   usage accounting (#155) — untouched, above this layer.
 * - approval semantics: `enforceInstallPolicy` fail-fast text, no
 *   pause/resume (#167) — tool execution path unchanged.
 * - risk enforcement in the bus/policy path, whole-tool and per-action
 *   denylists (#180) — `scopedTools` is the single input here.
 * - agent runs through the same tool registry as every plugin (#207).
 */

export interface ResponsesFunctionCall {
  callId: string;
  name: string;
  argsText: string;
}

export interface ResponsesTurn {
  text: string;
  functionCalls: ResponsesFunctionCall[];
  usage: unknown;
  responseId?: string;
  encryptedReasoning?: string[];
}

/** Reasoning effort allowlist mirrors loop.ts (defense in depth). */
const VALID_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];

export function responsesEffort(effort: unknown): string | undefined {
  return typeof effort === "string" && VALID_EFFORTS.includes(effort) ? effort : undefined;
}

/** Function names allow at most one dot (Meta constraint, see #221). */
export function toResponsesName(name: string): string {
  const dots = (name.match(/\./g) ?? []).length;
  if (dots <= 1) return name;
  // Temporary 1:1 mapping until #222 groups plugin-scoped functions under
  // namespace tools. Reversible via the responseNameMap in loop.ts.
  return name.replaceAll(".", "_");
}

export function assertResponsesToolName(name: string): void {
  const dots = (name.match(/\./g) ?? []).length;
  if (dots > 1) {
    throw new Error(`Tool name "${name}" has ${dots} dots; Responses allows at most one — group under a namespace tool (#222).`);
  }
}

/** Keep call_id within 1-64 chars; pair function_call with function_call_output. */
export function normalizeCallId(raw: unknown, fallbackIndex: number): string {
  let id = typeof raw === "string" ? raw : "";
  if (id.length === 0) id = `call_${Date.now().toString(36)}_${fallbackIndex}`;
  if (id.length > 64) id = id.slice(0, 64);
  return id;
}

export function toResponsesTools(tools: AgentTool[]): Array<{
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return tools.map((t) => {
    return {
      type: "function" as const,
      name: toResponsesName(t.name),
      description: t.description,
      parameters: z.toJSONSchema(t.schema) as Record<string, unknown>,
    };
  });
}

/**
 * Convert the loop's Chat-format user content into Responses input content.
 * Chat parts: { type: "text" } / { type: "image_url", image_url: { url } }.
 * Responses parts: { type: "input_text" } / { type: "input_image" }.
 */
export function toResponsesUserContent(content: unknown): unknown {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as any[]).map((p) => {
      if (p?.type === "image_url") {
        const url = p.image_url?.url ?? p.image_url;
        return { type: "input_image", image_url: url };
      }
      if (p?.type === "text") return { type: "input_text", text: p.text ?? "" };
      return p;
    });
  }
  return content;
}

export function hasResponsesSurface(client: unknown): boolean {
  return typeof (client as any)?.responses?.create === "function";
}

function extractTextFromOutput(output: any[]): string {
  let text = "";
  for (const item of output ?? []) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (typeof part?.text === "string") text += part.text;
        else if (part?.type === "output_text" && typeof part.text === "string") text += part.text;
      }
    } else if (item?.type === "output_text" && typeof item.text === "string") {
      text += item.text;
    }
  }
  return text;
}

function extractCallsFromOutput(output: any[]): ResponsesFunctionCall[] {
  const calls: ResponsesFunctionCall[] = [];
  (output ?? []).forEach((item, i) => {
    if (item?.type === "function_call") {
      calls.push({
        callId: normalizeCallId(item.call_id ?? item.id, i),
        name: String(item.name ?? ""),
        argsText: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
      });
    }
  });
  return calls;
}

function extractReasoningFromOutput(output: any[]): string[] {
  const out: string[] = [];
  for (const item of output ?? []) {
    if (item?.type === "reasoning" && typeof item.encrypted_content === "string") {
      out.push(item.encrypted_content);
    }
  }
  return out;
}

/**
 * One Responses turn with streaming primary: text deltas are forwarded as
 * they arrive (same first-paint behavior as the Chat path) and function
 * calls are accumulated. Providers/clients that answer with a plain object
 * (mocks, non-streaming deployments) are used directly — exactly one model
 * call per step, never two.
 *
 * Stateless replay: `store: false` + `include: ["reasoning.encrypted_content"]`.
 * `instructions`, `tools` and `reasoning.effort` are resent every turn —
 * Responses does not persist them across turns.
 */
export async function createResponsesTurn(input: {
  client: any;
  model: string;
  instructions: string;
  inputItems: any[];
  tools: ReturnType<typeof toResponsesTools>;
  effort?: string;
  signal?: AbortSignal;
  onTextDelta: (delta: string) => void | Promise<void>;
}): Promise<ResponsesTurn> {
  const { client, model, instructions, inputItems, tools, effort, signal, onTextDelta } = input;
  const params: any = {
    model,
    instructions,
    input: inputItems,
    store: false,
    include: ["reasoning.encrypted_content"],
  };
  if (tools.length > 0) {
    params.tools = tools;
    params.tool_choice = "auto";
  }
  const nestedEffort = responsesEffort(effort);
  if (nestedEffort) params.reasoning = { effort: nestedEffort };

  let streamed: any = null;
  try {
    streamed = await client.responses.create({ ...params, stream: true }, { signal } as any);
  } catch (err) {
    if (signal?.aborted) throw err;
    streamed = null;
  }
  if (!streamed || typeof streamed[Symbol.asyncIterator] !== "function") {
    if (streamed) return normalizeResponsesObject(streamed);
    const single = await client.responses.create(params, { signal } as any);
    return normalizeResponsesObject(single);
  }

  let text = "";
  const callAcc = new Map<number, { callId: string; name: string; args: string }>();
  let usage: unknown = {};
  let responseId: string | undefined;
  const encryptedReasoning: string[] = [];
  let outputIndex = 0;

  for await (const event of streamed as AsyncIterable<any>) {
    if (event?.response?.id && !responseId) responseId = event.response.id;
    if (event?.usage) usage = event.usage;
    const t = event?.type ?? "";

    // Text deltas: response.output_text.delta { delta: string }.
    if (t.includes("output_text") && t.endsWith("delta") && typeof event?.delta === "string") {
      text += event.delta;
      await onTextDelta(event.delta);
      continue;
    }
    // Some SDKs emit response.text.delta instead.
    if ((t === "response.text.delta" || t.endsWith("text.delta")) && typeof event?.delta === "string") {
      text += event.delta;
      await onTextDelta(event.delta);
      continue;
    }
    // Function-call argument deltas stream per output index.
    if (t.includes("function_call") && t.endsWith("delta")) {
      const idx = typeof event?.output_index === "number" ? event.output_index : outputIndex;
      const cur = callAcc.get(idx) ?? { callId: "", name: "", args: "" };
      const itemDelta = event?.delta ?? event?.arguments ?? event?.item ?? {};
      if (typeof event?.call_id === "string" && event.call_id) cur.callId = event.call_id;
      if (typeof itemDelta?.call_id === "string" && itemDelta.call_id) cur.callId = itemDelta.call_id;
      if (typeof event?.name === "string" && event.name) cur.name = event.name;
      if (typeof itemDelta?.name === "string" && itemDelta.name) cur.name = itemDelta.name;
      const argDelta =
        typeof event?.arguments_delta === "string"
          ? event.arguments_delta
          : typeof itemDelta?.arguments === "string"
            ? itemDelta.arguments
            : typeof event?.delta === "string"
              ? event.delta
              : "";
      cur.args += argDelta;
      callAcc.set(idx, cur);
      continue;
    }
    // Completed items carry the full function call + reasoning payloads.
    if (t === "response.output_item.done" || t === "response.output_item.added") {
      const item = event?.item ?? {};
      if (item?.type === "function_call") {
        const idx = typeof event?.output_index === "number" ? event.output_index : outputIndex++;
        callAcc.set(idx, {
          callId: normalizeCallId(item.call_id ?? item.id, idx),
          name: String(item.name ?? callAcc.get(idx)?.name ?? ""),
          args: typeof item.arguments === "string" ? item.arguments : (callAcc.get(idx)?.args ?? ""),
        });
      } else if (item?.type === "reasoning" && typeof item.encrypted_content === "string") {
        encryptedReasoning.push(item.encrypted_content);
      } else if (item?.type === "message" && Array.isArray(item.content)) {
        // Non-delta message items (some transports send whole messages).
        for (const part of item.content) {
          if (part?.type === "output_text" && typeof part.text === "string" && !t.endsWith("delta")) {
            // Only count if we have not already streamed it; the completed
            // response event below is the authoritative source, so skip
            // partial duplicates here and rely on response.completed.
          }
        }
      }
      continue;
    }
    if (t === "response.completed" || t === "response.done") {
      const response = event?.response ?? event;
      if (response?.id) responseId = response.id;
      if (response?.usage) usage = response.usage;
      const output = response?.output ?? [];
      const fullText = extractTextFromOutput(output);
      if (fullText && !text) text = fullText;
      const fullCalls = extractCallsFromOutput(output);
      for (const c of fullCalls) {
        const existing = [...callAcc.values()].find((v) => v.callId === c.callId && v.name);
        if (!existing) callAcc.set(callAcc.size + 1000, c);
      }
      for (const e of extractReasoningFromOutput(output)) {
        if (!encryptedReasoning.includes(e)) encryptedReasoning.push(e);
      }
      continue;
    }
  }

  const functionCalls: ResponsesFunctionCall[] = [...callAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, v]) => v.name)
    .map(([idx, v], i) => ({
      callId: normalizeCallId(v.callId || `stream_call_${idx}_${i}`, i),
      name: v.name,
      argsText: v.args,
    }));

  return { text, functionCalls, usage, responseId, encryptedReasoning };
}

/** Normalize a plain (non-streaming) Responses object to a turn. */
export function normalizeResponsesObject(response: any): ResponsesTurn {
  const output = response?.output ?? [];
  return {
    text: extractTextFromOutput(output) || response?.output_text || "",
    functionCalls: extractCallsFromOutput(output),
    usage: response?.usage ?? {},
    responseId: response?.id,
    encryptedReasoning: extractReasoningFromOutput(output),
  };
}
