import { db } from "../workspace/db";
import { pluginRegistry } from "./registry";
import type { CapabilityManifest, CapabilityRisk } from "./manifest";
import { evaluateCapabilityPolicy } from "./policy";
import {
  createScopedExecutionContext,
  type ScopedExecutionContext,
  type ScopedFsContext,
  type ScopedFetchContext,
  type ScopedExecContext,
  type ScopedSecretsContext,
} from "./context";
import { redactSecrets } from "./redact";
import { resolveAdapterHandler } from "./adapters";

export interface ExecutionContext {
  actor: "agent" | "user";
  cityId?: string;
  signal?: AbortSignal;
  log: (msg: string) => void;
  emit?: (event: { type: string; payload: Record<string, unknown> }) => Promise<void> | void;
  fs?: ScopedFsContext;
  fetch?: ScopedFetchContext;
  exec?: ScopedExecContext;
  secrets?: ScopedSecretsContext;
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
  adapter?: CapabilityManifest["adapter"];
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
    const effectiveHandler = handler || resolveAdapterHandler(capability.adapter);
    const registered: RegisteredCapability = {
      id: capability.id,
      pluginId,
      title: capability.title,
      description: capability.description,
      risk: capability.risk,
      inputSchema: capability.input,
      outputSchema: capability.output,
      adapter: capability.adapter,
      handler: effectiveHandler,
    };

    if (effectiveHandler) {
      this.handlers.set(capability.id, { handler: effectiveHandler, meta: registered });
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
          adapter: cap.adapter,
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
            adapter: cap.adapter,
          });
          seen.add(cap.id);
        }
      }
    }

    return list;
  }

  /**
   * Invoke a capability via the typed bus.
   * Validates policy, validates schema, logs execution in SQLite, enforces timeout,
   * redacts secrets, and emits SSE events.
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
      this.recordExecution(
        executionId,
        capabilityId,
        "unknown",
        options.actor,
        options.cityId,
        "failed",
        0,
        redactSecrets(rawInput),
        null,
        err
      );
      return { success: false, executionId, capabilityId, pluginId: "unknown", error: err, durationMs: 0 };
    }

    const pluginId = capability.pluginId;

    // 2. Verify plugin is enabled (if plugin exists in registry)
    const plugin = pluginRegistry.get(pluginId);
    if (plugin && !plugin.enabled) {
      const err = `Plugin "${pluginId}" is currently disabled.`;
      this.recordExecution(
        executionId,
        capabilityId,
        pluginId,
        options.actor,
        options.cityId,
        "denied",
        0,
        redactSecrets(rawInput),
        null,
        err
      );
      return { success: false, executionId, capabilityId, pluginId, error: err, durationMs: 0 };
    }

    // 3. Security Policy Evaluation (default-deny, destructive confirmations, external first-use)
    const activePlugin =
      plugin ?? {
        id: pluginId,
        name: pluginId,
        version: "1.0.0",
        manifest: {
          apiVersion: 1 as const,
          id: pluginId,
          name: pluginId,
          version: "1.0.0",
          description: "",
          icon: "default",
          trust: "core" as const,
          capabilities: [],
          permissions: [],
        },
        enabled: true,
        trust: "core" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

    const policyResult = await evaluateCapabilityPolicy({
      capability,
      plugin: activePlugin,
      actor: options.actor,
      cityId: options.cityId,
      input:
        rawInput && typeof rawInput === "object"
          ? (redactSecrets(rawInput) as Record<string, unknown>)
          : {},
      timeoutMs: options.timeoutMs,
      emit: async (evt) => {
        if (options.onEvent) {
          await options.onEvent({ step, type: evt.type, payload: evt.payload });
        }
      },
    });

    if (!policyResult.allowed) {
      const err = policyResult.reason || `Execution denied by policy for capability "${capabilityId}".`;
      this.recordExecution(
        executionId,
        capabilityId,
        pluginId,
        options.actor,
        options.cityId,
        "denied",
        0,
        redactSecrets(rawInput),
        null,
        err
      );

      if (options.onEvent) {
        await options.onEvent({
          step,
          type: "tool.done",
          payload: {
            id: executionId,
            name: capabilityId,
            result: { error: err, status: "denied" },
            pluginId,
            capabilityId,
          },
        });
      }

      return { success: false, executionId, capabilityId, pluginId, error: err, durationMs: 0 };
    }

    // 4. Emit tool.start SSE event (preserving compatibility)
    if (options.onEvent) {
      await options.onEvent({
        step,
        type: "tool.start",
        payload: {
          id: executionId,
          name: capabilityId,
          arguments: redactSecrets(rawInput) as Record<string, unknown>,
          pluginId,
          capabilityId,
        },
      });
    }

    // 5. Validate input against schema if Zod schema
    let validatedInput = rawInput;
    if (capability.inputSchema && typeof capability.inputSchema.safeParse === "function") {
      const parseResult = capability.inputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        const errorMsg = `Input validation error: ${parseResult.error.message}`;
        const duration = Date.now() - startTime;
        this.recordExecution(
          executionId,
          capabilityId,
          pluginId,
          options.actor,
          options.cityId,
          "failed",
          duration,
          redactSecrets(rawInput),
          null,
          errorMsg
        );

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

    // 6. Look up executable handler
    const handlerRecord = this.handlers.get(capabilityId);
    const handler = handlerRecord?.handler || resolveAdapterHandler(capability.adapter);
    if (!handler) {
      const err = `No execution handler registered for capability "${capabilityId}".`;
      const duration = Date.now() - startTime;
      this.recordExecution(
        executionId,
        capabilityId,
        pluginId,
        options.actor,
        options.cityId,
        "failed",
        duration,
        redactSecrets(validatedInput),
        null,
        err
      );
      return { success: false, executionId, capabilityId, pluginId, error: err, durationMs: duration };
    }

    // 7. Execute handler with scoped execution context, timeout and abort signal
    const timeoutMs = options.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("Capability execution timed out"), timeoutMs);

    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort(options.signal?.reason));
    }

    try {
      this.recordExecution(
        executionId,
        capabilityId,
        pluginId,
        options.actor,
        options.cityId,
        "running",
        0,
        redactSecrets(validatedInput),
        null,
        null
      );

      const ctx: ScopedExecutionContext = createScopedExecutionContext({
        pluginId,
        manifest: activePlugin.manifest,
        actor: options.actor,
        cityId: options.cityId,
        signal: controller.signal,
        log: (msg) => console.log(`[CapabilityBus][${capabilityId}] ${msg}`),
        emit: async (evt) => {
          if (options.onEvent) {
            await options.onEvent({ step, type: evt.type, payload: evt.payload });
          }
        },
      });

      const result = await Promise.race([
        handler(validatedInput, ctx),
        new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error(controller.signal.reason || "Execution aborted"));
          });
        }),
      ]);

      clearTimeout(timer);
      const duration = Date.now() - startTime;
      const safeResult = redactSecrets(result);

      this.updateExecution(executionId, "success", duration, safeResult, null);

      if (options.onEvent) {
        await options.onEvent({
          step,
          type: "tool.done",
          payload: {
            id: executionId,
            name: capabilityId,
            result: safeResult,
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
        data: safeResult as T,
        durationMs: duration,
      };
    } catch (err: any) {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      const errorMsg = redactSecrets(err.message || String(err));

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
    executionId: string,
    capabilityId: string,
    pluginId: string,
    actor: "agent" | "user",
    cityId: string | undefined,
    status: "running" | "success" | "failed" | "denied",
    durationMs: number,
    input: unknown,
    output: unknown,
    error: string | null
  ): void {
    try {
      const now = new Date().toISOString();
      db.query(
        `INSERT INTO executions (execution_id, capability_id, plugin_id, actor, city_id, status, duration_ms, input_json, output_json, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        executionId,
        capabilityId,
        pluginId,
        actor,
        cityId || null,
        status,
        durationMs,
        input !== undefined ? JSON.stringify(redactSecrets(input)) : null,
        output !== null && output !== undefined ? JSON.stringify(redactSecrets(output)) : null,
        error ? redactSecrets(error) : null,
        now
      );
    } catch {
      // Non-blocking telemetry failure
    }
  }

  private updateExecution(
    executionId: string,
    status: "success" | "failed" | "denied",
    durationMs: number,
    output: unknown,
    error: string | null
  ): void {
    try {
      db.query(
        `UPDATE executions 
         SET status = ?, duration_ms = ?, output_json = ?, error = ?
         WHERE execution_id = ?`
      ).run(
        status,
        durationMs,
        output !== null && output !== undefined ? JSON.stringify(redactSecrets(output)) : null,
        error ? redactSecrets(error) : null,
        executionId
      );
    } catch {
      // Non-blocking telemetry failure
    }
  }
}

export const capabilityBus = CapabilityBus.getInstance();
