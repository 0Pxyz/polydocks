import { z } from "zod";
import { pluginRegistry } from "./registry";
import { capabilityBus, type ExecutionContext } from "./bus";
import type { PluginManifest } from "./manifest";

/**
 * Unified first-party capability contract.
 *
 * One definition produces every invocation surface:
 * - agent: registered on the capability bus, reachable via
 *   find_capabilities / invoke_capability with the same envelope;
 * - HTTP: POST /api/plugins/:pluginId/:capability returns the envelope;
 * - CLI: `polydocks <plugin> <capability>` with flags from the schema.
 *
 * Envelope (the ONLY thing the agent may report):
 *   { ok: true, id?, data, events } | { ok: false, error, retryable, events? }
 *
 * Framework emission rule: after the handler terminates with ok, the
 * framework emits events — never the handler at its own pleasure. The
 * handler may return an explicit `events` array (subset of declared
 * `emits`) describing what actually happened; exactly those go out.
 * Otherwise every declared event goes out with the result payload.
 * A handler that changed nothing (e.g. dedupe) returns `events: []`
 * and stays silent.
 */

export interface ContractEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface ContractSuccess {
  ok: true;
  id?: string;
  data: unknown;
  events?: ContractEvent[];
}

export interface ContractFailure {
  ok: false;
  error: string;
  retryable: boolean;
  events?: ContractEvent[];
}

export type ContractEnvelope = ContractSuccess | ContractFailure;

export interface ContractContext extends Omit<ExecutionContext, "emit"> {
  emit: (event: ContractEvent) => Promise<void> | void;
}

export interface ContractCapabilityDef {
  /** Plugin id this capability belongs to (row created if missing). */
  plugin: string;
  /** Short name; full capability id is `${plugin}.${name}`. */
  name: string;
  title: string;
  description: string;
  scope: "global" | "city";
  input: z.ZodTypeAny;
  output?: z.ZodTypeAny;
  /** SSE event types the framework emits after a successful run. */
  emits: string[];
  risk?: "read" | "write" | "destructive" | "external";
  handler: (input: any, ctx: ContractContext) => Promise<unknown>;
}

const contracts = new Map<string, ContractCapabilityDef>();

export function listContractCapabilities(): ContractCapabilityDef[] {
  return [...contracts.values()];
}

export function getContractCapability(pluginId: string, name: string): ContractCapabilityDef | null {
  return contracts.get(`${pluginId}.${name}`) ?? null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toEnvelopeError(error: unknown, retryable: boolean, events: ContractEvent[]): ContractFailure {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return { ok: false, error: message, retryable, events };
}

/**
 * Defines a first-party capability once and registers it everywhere:
 * plugin registry manifest, capability bus (agent surface), and the
 * contract list that generates the HTTP route and CLI command.
 */
export function defineCapability(def: ContractCapabilityDef): string {
  const fullId = `${def.plugin}.${def.name}`;
  if (contracts.has(fullId)) return fullId;

  // 1. Ensure the plugin row exists so the manifest stays truthful.
  const existing = pluginRegistry.get(def.plugin);
  const manifest: PluginManifest = existing
    ? existing.manifest
    : {
        apiVersion: 1,
        id: def.plugin,
        name: def.plugin,
        version: "1.0.0",
        description: `${def.plugin} first-party plugin`,
        icon: "Layers",
        trust: "first-party",
        capabilities: [],
        surfaces: [],
        permissions: [],
      };
  if (!manifest.capabilities.some((c) => c.id === fullId)) {
    manifest.capabilities = [
      ...manifest.capabilities,
      {
        id: fullId,
        title: def.title,
        description: def.description,
        risk: def.risk ?? "read",
        input: def.input,
        ...(def.output ? { output: def.output } : {}),
      },
    ];
    pluginRegistry.install(manifest);
  }

  // 2. Wrap the handler: record-only emit during run, output validation,
  // envelope normalization, framework emission of declared events on ok.
  const wrapped = async (input: any, ctx: ExecutionContext) => {
    const recorded: ContractEvent[] = [];
    const recordEmit = async (evt: ContractEvent) => {
      recorded.push(evt);
    };

    // City scope requires a city context; fail fast instead of writing
    // to the wrong scope.
    const cityId = (isRecord(input) && typeof input.cityId === "string" && input.cityId) || ctx.cityId;
    if (def.scope === "city" && !cityId) {
      return {
        ok: false as const,
        error: `Capability "${fullId}" requires city scope: pass cityId.`,
        retryable: false as const,
        events: recorded,
      };
    }

    let raw: unknown;
    try {
      raw = await def.handler(input, { ...ctx, emit: recordEmit });
    } catch (err) {
      return toEnvelopeError(err, true, recorded);
    }

    // Normalize: handlers may return raw data or a partial envelope.
    // An explicit `events` array describes what actually happened (a
    // handler that changed nothing, e.g. dedupe, returns `events: []`
    // to stay silent); otherwise every declared event goes out.
    let data: unknown = raw;
    let id: string | undefined;
    let handlerEvents: ContractEvent[] | undefined;
    if (isRecord(raw) && "ok" in raw) {
      if (raw.ok !== true) {
        const fail = raw as { error?: unknown; retryable?: unknown; events?: ContractEvent[] };
        return {
          ok: false as const,
          error: typeof fail.error === "string" ? fail.error : "Capability failed without an error message.",
          retryable: fail.retryable === true,
          events: [...(Array.isArray(fail.events) ? fail.events : []), ...recorded],
        };
      }
      data = (raw as { data?: unknown }).data;
      if (typeof (raw as { id?: unknown }).id === "string") id = (raw as { id: string }).id;
      if (Array.isArray((raw as { events?: unknown }).events)) {
        handlerEvents = (raw as { events: ContractEvent[] }).events.filter(
          (e) => e && typeof e.type === "string" && def.emits.includes(e.type)
        );
      }
    }

    // Output contract: invalid output is a bug, not a retryable failure.
    if (def.output) {
      const parsed = def.output.safeParse(data);
      if (!parsed.success) {
        return {
          ok: false as const,
          error: `Output contract violated by "${fullId}": ${parsed.error.message}`,
          retryable: false as const,
          events: recorded,
        };
      }
      data = parsed.data;
    }

    // Framework emission: declared events go out AFTER success, with the
    // result payload. Never the handler's job: when the handler names
    // explicit events, exactly those go out; otherwise all declared ones.
    const emitted: ContractEvent[] = [...recorded];
    const basePayload: Record<string, unknown> = {
      capability: fullId,
      plugin: def.plugin,
      ...(isRecord(data) ? data : { result: data }),
    };
    const toEmit = handlerEvents ?? def.emits.map((type) => ({ type, payload: { ...basePayload } }));
    for (const evt of toEmit) {
      const full = { type: evt.type, payload: { ...basePayload, ...(isRecord(evt.payload) ? evt.payload : {}) } };
      if (emitted.some((e) => e.type === full.type && JSON.stringify(e.payload) === JSON.stringify(full.payload))) {
        continue;
      }
      emitted.push(full);
      if (ctx.emit) {
        try {
          await ctx.emit(full);
        } catch {
          // A broken subscriber must not fail a successful capability.
        }
      }
    }

    return { ok: true as const, ...(id ? { id } : {}), data, events: emitted };
  };

  capabilityBus.register(def.plugin, {
    id: fullId,
    title: def.title,
    description: def.description,
    risk: def.risk ?? "read",
    input: def.input,
    ...(def.output ? { output: def.output } : {}),
  } as any, wrapped as any);

  contracts.set(fullId, def);
  return fullId;
}
