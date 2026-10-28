import { db } from "../workspace/db";
import { pluginRegistry } from "./registry";
import type { CapabilityManifest, CapabilityRisk } from "./manifest";

export interface ExecutionContext {
  actor: "agent" | "user";
  cityId?: string;
  signal?: AbortSignal;
  log: (msg: string) => void;
  emit?: (event: { type: string; payload: Record<string, unknown> }) => Promise<void> | void;
}

export type CapabilityHandler = (input: any, ctx: ExecutionContext) => Promise<any> | any;

export interface RegisteredCapability {
  id: string;
  pluginId: string;
  title: string;
  description: string;
  risk: CapabilityRisk;
  inputSchema: any;
  outputSchema?: any;
  handler?: CapabilityHandler;
}

export interface CapabilityExecutionOptions {
  actor: "agent" | "user";
  cityId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  step?: number;
  onEvent?: (event: {
    step: number;
    type: string;
    payload: Record<string, unknown>;
  }) => Promise<void> | void;
}

export interface ExecutionResult<T = unknown> {
  success: boolean;
  executionId: string;
  capabilityId: string;
  pluginId: string;
  data?: T;
  error?: string;
  durationMs: number;
}

export class CapabilityBus {
  private static instance: CapabilityBus | null = null;
  private handlers = new Map<string, { handler: CapabilityHandler; meta: RegisteredCapability }>();

  public static getInstance(): CapabilityBus {
    if (!CapabilityBus.instance) {
      CapabilityBus.instance = new CapabilityBus();
    }
    return CapabilityBus.instance;
  }

  /**
   * Register a capability implementation handler.
   */
  public register(
    pluginId: string,
    capability: CapabilityManifest,
    handler?: CapabilityHandler
  ): void {
    const registered: RegisteredCapability = {
      id: capability.id,
      pluginId,
      title: capability.title,
      description: capability.description,
      risk: capability.risk,
      inputSchema: capability.input,
      outputSchema: capability.output,
      handler,
    };

    if (handler) {
      this.handlers.set(capability.id, { handler, meta: registered });
    }
  }

  /**
   * Unregister a capability.
   */
  public unregister(capabilityId: string): void {
    this.handlers.delete(capabilityId);
  }

  /**
   * Look up a capability across handlers and installed plugins.
   */
  public getCapability(capabilityId: string): RegisteredCapability | null {
    const registered = this.handlers.get(capabilityId);
    if (registered) return registered.meta;

    // Check installed plugins
    const plugins = pluginRegistry.list();
    for (const plugin of plugins) {
      const cap = plugin.manifest.capabilities?.find((c) => c.id === capabilityId);
      if (cap) {
        return {
          id: cap.id,
          pluginId: plugin.id,
          title: cap.title,
          description: cap.description,
          risk: cap.risk,
          inputSchema: cap.input,
          outputSchema: cap.output,
        };
      }
    }

    return null;
  }

  /**
   * List all available capabilities across registered handlers and installed plugins.
   */
  public getCapabilities(options?: { enabledOnly?: boolean }): RegisteredCapability[] {
    const list: RegisteredCapability[] = [];
    const seen = new Set<string>();

    // 1. Registered active handlers
    for (const [, item] of this.handlers) {
      const plugin = pluginRegistry.get(item.meta.pluginId);
      if (options?.enabledOnly && plugin && !plugin.enabled) {
        continue;
      }
      list.push(item.meta);
      seen.add(item.meta.id);
    }

    // 2. Installed plugins capabilities
    const plugins = pluginRegistry.list(options);
    for (const plugin of plugins) {
      for (const cap of plugin.manifest.capabilities || []) {
        if (!seen.has(cap.id)) {
          list.push({
            id: cap.id,
            pluginId: plugin.id,
            title: cap.title,
            description: cap.description,
            risk: cap.risk,
            inputSchema: cap.input,
            outputSchema: cap.output,
          });
          seen.add(cap.id);
        }
      }
    }

    return list;
  }

  /**
   * Invoke a capability via the typed bus.
   * Validates schema, logs execution in SQLite, enforces timeout, and emits SSE events.
   */
  public async invoke<T = unknown>(
    capabilityId: string,
    rawInput: unknown,
    options: CapabilityExecutionOptions
  ): Promise<ExecutionResult<T>> {
    const startTime = Date.now();
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const step = options.step ?? 1;

    // 1. Resolve capability
    const capability = this.getCapability(capabilityId);
    if (!capability) {
      const err = `Capability "${capabilityId}" not found in registry.`;
      this.recordExecution(executionId, capabilityId, "unknown", options.actor, options.cityId, "failed", 0, rawInput, null, err);
      return { success: false, executionId, capabilityId, pluginId: "unknown", error: err, durationMs: 0 };
    }

    const pluginId = capability.pluginId;

    // 2. Verify plugin is enabled (if plugin exists in registry)
    const plugin = pluginRegistry.get(pluginId);
    if (plugin && !plugin.enabled) {
      const err = `Plugin "${pluginId}" is currently disabled.`;
      this.recordExecution(executionId, capabilityId, pluginId, options.actor, options.cityId, "denied", 0, rawInput, null, err);
      return { success: false, executionId, capabilityId, pluginId, error: err, durationMs: 0 };
    }

    // 3. Emit tool.start SSE event (preserving compatibility)
    if (options.onEvent) {
      await options.onEvent({
        step,
        type: "tool.start",
        payload: {
          id: executionId,
          name: capabilityId,
          arguments: rawInput as Record<string, unknown>,
          pluginId,
          capabilityId,
        },
      });
    }

    // 4. Validate input against schema if Zod schema
    let validatedInput = rawInput;
    if (capability.inputSchema && typeof capability.inputSchema.safeParse === "function") {
      const parseResult = capability.inputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        const errorMsg = `Input validation error: ${parseResult.error.message}`;
        const duration = Date.now() - startTime;
        this.recordExecution(executionId, capabilityId, pluginId, options.actor, options.cityId, "failed", duration, rawInput, null, errorMsg);

        if (options.onEvent) {
          await options.onEvent({
            step,
            type: "tool.done",
            payload: {
              id: executionId,
              name: capabilityId,
              result: { error: errorMsg },
              pluginId,
              capabilityId,
            },
          });
        }

        return { success: false, executionId, capabilityId, pluginId, error: errorMsg, durationMs: duration };
      }
      validatedInput = parseResult.data;
    }

    // 5. Look up executable handler
    const handlerRecord = this.handlers.get(capabilityId);
    if (!handlerRecord?.handler) {
      const err = `No execution handler registered for capability "${capabilityId}".`;
      const duration = Date.now() - startTime;
      this.recordExecution(executionId, capabilityId, pluginId, options.actor, options.cityId, "failed", duration, validatedInput, null, err);
      return { success: false, executionId, capabilityId, pluginId, error: err, durationMs: duration };
    }

    // 6. Execute handler with timeout and abort signal
    const timeoutMs = options.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("Capability execution timed out"), timeoutMs);

    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort(options.signal?.reason));
    }

    try {
      this.recordExecution(executionId, capabilityId, pluginId, options.actor, options.cityId, "running", 0, validatedInput, null, null);

      const ctx: ExecutionContext = {
        actor: options.actor,
        cityId: options.cityId,
        signal: controller.signal,
        log: (msg) => console.log(`[CapabilityBus][${capabilityId}] ${msg}`),
        emit: async (evt) => {
          if (options.onEvent) {
            await options.onEvent({ step, type: evt.type, payload: evt.payload });
          }
        },
      };

      const result = await Promise.race([
        handlerRecord.handler(validatedInput, ctx),
        new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error(controller.signal.reason || "Execution aborted"));
          });
        }),
      ]);

      clearTimeout(timer);
      const duration = Date.now() - startTime;

      this.updateExecution(executionId, "success", duration, result, null);

      if (options.onEvent) {
        await options.onEvent({
          step,
          type: "tool.done",
          payload: {
            id: executionId,
            name: capabilityId,
            result,
            pluginId,
            capabilityId,
          },
        });
      }

      return {
        success: true,
        executionId,
        capabilityId,
        pluginId,
        data: result as T,
        durationMs: duration,
      };
    } catch (err: any) {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      const errorMsg = err.message || String(err);

      this.updateExecution(executionId, "failed", duration, null, errorMsg);

      if (options.onEvent) {
        await options.onEvent({
          step,
          type: "tool.done",
          payload: {
            id: executionId,
            name: capabilityId,
            result: { error: errorMsg },
            pluginId,
            capabilityId,
          },
        });
      }

      return {
        success: false,
        executionId,
        capabilityId,
        pluginId,
        error: errorMsg,
        durationMs: duration,
      };
    }
  }

  private recordExecution(
    id: string,
    capabilityId: string,
    pluginId: string,
    actor: string,
    cityId: string | undefined,
    status: string,
    durationMs: number,
    input: unknown,
    output: unknown,
    error: string | null
  ): void {
    try {
      db.query(
        `INSERT INTO executions (execution_id, capability_id, plugin_id, actor, city_id, status, duration_ms, input_json, output_json, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        capabilityId,
        pluginId,
        actor,
        cityId || null,
        status,
        durationMs,
        JSON.stringify(input || null),
        JSON.stringify(output || null),
        error,
        new Date().toISOString()
      );
    } catch {
      // Ignore SQLite write error during execution recording
    }
  }

  private updateExecution(
    id: string,
    status: string,
    durationMs: number,
    output: unknown,
    error: string | null
  ): void {
    try {
      db.query(
        `UPDATE executions 
         SET status = ?, duration_ms = ?, output_json = ?, error = ?
         WHERE execution_id = ?`
      ).run(status, durationMs, JSON.stringify(output || null), error, id);
    } catch {
      // Ignore SQLite update error
    }
  }
}

export const capabilityBus = CapabilityBus.getInstance();
