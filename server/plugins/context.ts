import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { validateUrlForSsrf, isHostAllowed } from "./ssrf";
import { registerSecret, redactSecrets } from "./redact";
import type { PluginManifest } from "./manifest";

export interface ScopedFsContext {
  rootDir: string;
  resolvePath: (relPath: string) => string;
  readFile: (relPath: string) => Promise<string>;
  writeFile: (relPath: string, content: string) => Promise<void>;
  listFiles: (relPath?: string) => Promise<string[]>;
  exists: (relPath: string) => Promise<boolean>;
}

export interface ScopedFetchContext {
  (
    url: string | URL,
    init?: RequestInit & { timeoutMs?: number; maxBytes?: number }
  ): Promise<Response>;
}

export interface ScopedExecContext {
  (
    binary: string,
    args: string[],
    options?: { timeoutMs?: number; maxBuffer?: number; cwd?: string }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface ScopedSecretsContext {
  get: (name: string) => string | undefined;
}

export interface ScopedExecutionContext {
  actor: "agent" | "user";
  cityId?: string;
  pluginId: string;
  signal?: AbortSignal;
  log: (msg: string) => void;
  emit?: (event: { type: string; payload: Record<string, unknown> }) => Promise<void> | void;
  fs: ScopedFsContext;
  fetch: ScopedFetchContext;
  exec: ScopedExecContext;
  secrets: ScopedSecretsContext;
}

/**
 * Creates a scoped execution context for a capability handler adhering strictly
 * to the plugin's declared permissions, path confinement, SSRF protections, and secret redaction.
 */
export function createScopedExecutionContext(params: {
  pluginId: string;
  manifest: PluginManifest;
  actor: "agent" | "user";
  cityId?: string;
  signal?: AbortSignal;
  log?: (msg: string) => void;
  emit?: (event: { type: string; payload: Record<string, unknown> }) => Promise<void> | void;
}): ScopedExecutionContext {
  const { pluginId, manifest, actor, cityId, signal, log, emit } = params;

  // 1. Filesystem confinement
  const workspaceRoot = path.resolve(process.cwd(), "workspace");
  const rootDir = cityId
    ? path.resolve(workspaceRoot, cityId)
    : path.resolve(workspaceRoot, "plugins", pluginId);

  // Ensure root dir exists
  if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  const resolveSafePath = (relPath: string): string => {
    const target = path.resolve(rootDir, relPath || ".");
    if (target !== rootDir && !target.startsWith(rootDir + path.sep)) {
      throw new Error(`Path traversal violation: Access outside granted root (${relPath})`);
    }

    if (fs.existsSync(target)) {
      try {
        const real = fs.realpathSync(target);
        if (real !== rootDir && !real.startsWith(rootDir + path.sep)) {
          throw new Error(`Path traversal violation: Symlink escapes granted root (${relPath})`);
        }
      } catch (err: any) {
        if (err.message.includes("Path traversal violation")) throw err;
      }
    }

    return target;
  };

  const fsContext: ScopedFsContext = {
    rootDir,
    resolvePath: resolveSafePath,
    readFile: async (relPath: string) => {
      const filePath = resolveSafePath(relPath);
      return fs.promises.readFile(filePath, "utf-8");
    },
    writeFile: async (relPath: string, content: string) => {
      const filePath = resolveSafePath(relPath);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content, "utf-8");
    },
    listFiles: async (relPath?: string) => {
      const dirPath = resolveSafePath(relPath || ".");
      if (!fs.existsSync(dirPath)) return [];
      return fs.promises.readdir(dirPath);
    },
    exists: async (relPath: string) => {
      try {
        const p = resolveSafePath(relPath);
        return fs.existsSync(p);
      } catch {
        return false;
      }
    },
  };

  // 2. Fetch context with SSRF protection & Host allowlist
  const allowedHosts: string[] = [];
  for (const perm of manifest.permissions || []) {
    if (perm.type === "net") {
      allowedHosts.push(...perm.hosts);
    }
  }

  const scopedFetch: ScopedFetchContext = async (urlInput, init) => {
    const ssrfCheck = validateUrlForSsrf(urlInput);
    if (!ssrfCheck.safe || !ssrfCheck.url) {
      throw new Error(`SSRF Guard Blocked: ${ssrfCheck.reason || "Forbidden URL"}`);
    }

    const targetUrl = ssrfCheck.url;

    // Verify host against declared net permissions if not first-party/core
    if (manifest.trust !== "core" && manifest.trust !== "first-party") {
      if (allowedHosts.length === 0 || !isHostAllowed(targetUrl.hostname, allowedHosts)) {
        throw new Error(
          `Host not permitted: "${targetUrl.hostname}". Plugin "${pluginId}" has not declared net permission for this host.`
        );
      }
    }

    const maxBytes = init?.maxBytes ?? 5 * 1024 * 1024; // 5MB default cap
    const timeoutMs = init?.timeoutMs ?? 15_000;

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort("Network request timed out"), timeoutMs);

    if (signal) {
      signal.addEventListener("abort", () => controller.abort(signal.reason));
    }

    try {
      const response = await fetch(targetUrl.toString(), {
        ...init,
        signal: controller.signal,
      });

      // Wrap response to cap body payload size
      const originalArrayBuffer = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => {
        const buf = await originalArrayBuffer();
        if (buf.byteLength > maxBytes) {
          throw new Error(`Payload size exceeded limit of ${maxBytes} bytes`);
        }
        return buf;
      };

      const originalText = response.text.bind(response);
      response.text = async () => {
        const text = await originalText();
        if (Buffer.byteLength(text, "utf-8") > maxBytes) {
          throw new Error(`Payload size exceeded limit of ${maxBytes} bytes`);
        }
        return text;
      };

      return response;
    } finally {
      clearTimeout(timeoutTimer);
    }
  };

  // 3. Exec context (argument array only, allowlist verified)
  const allowedCommands: string[] = [];
  for (const perm of manifest.permissions || []) {
    if (perm.type === "exec") {
      allowedCommands.push(...perm.commands);
    }
  }

  const scopedExec: ScopedExecContext = async (binary, args, options) => {
    if (manifest.trust !== "core") {
      const isAllowed = allowedCommands.includes(binary) || allowedCommands.includes("*");
      if (!isAllowed) {
        throw new Error(
          `Binary execution denied: Command "${binary}" is not in the declared exec permissions of plugin "${pluginId}".`
        );
      }
    }

    if (!Array.isArray(args)) {
      throw new Error("Invalid command execution: Arguments must be provided as an array of strings.");
    }

    const timeoutMs = options?.timeoutMs ?? 10_000;
    const maxBuffer = options?.maxBuffer ?? 1024 * 1024; // 1MB default
    const cwd = options?.cwd ? resolveSafePath(options.cwd) : rootDir;

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let killed = false;

      const proc = spawn(binary, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false, // strictly no shell string execution
      });

      const timer = setTimeout(() => {
        killed = true;
        proc.kill("SIGKILL");
        reject(new Error(`Command "${binary}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.length > maxBuffer) {
          killed = true;
          proc.kill("SIGKILL");
          reject(new Error(`Command stdout buffer exceeded ${maxBuffer} bytes`));
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > maxBuffer) {
          killed = true;
          proc.kill("SIGKILL");
          reject(new Error(`Command stderr buffer exceeded ${maxBuffer} bytes`));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      proc.on("close", (exitCode) => {
        clearTimeout(timer);
        if (!killed) {
          resolve({
            stdout,
            stderr,
            exitCode: exitCode ?? 0,
          });
        }
      });
    });
  };

  // 4. Scoped Secrets retrieval with canary secret registration
  const declaredSecrets = new Set<string>();
  for (const perm of manifest.permissions || []) {
    if (perm.type === "secret") {
      declaredSecrets.add(perm.name);
    }
  }

  const secretsContext: ScopedSecretsContext = {
    get: (name: string) => {
      if (manifest.trust !== "core" && !declaredSecrets.has(name) && !declaredSecrets.has("*")) {
        throw new Error(
          `Secret access denied: Plugin "${pluginId}" has not declared permission for secret "${name}".`
        );
      }

      const val = process.env[name];
      if (val) {
        registerSecret(val);
      }
      return val;
    },
  };

  return {
    actor,
    cityId,
    pluginId,
    signal,
    log: (msg: string) => {
      const redacted = redactSecrets(msg);
      if (log) {
        log(redacted);
      } else {
        console.log(`[Plugin:${pluginId}] ${redacted}`);
      }
    },
    emit: emit
      ? async (evt) => {
          const redactedPayload = redactSecrets(evt.payload);
          await emit({ type: evt.type, payload: redactedPayload });
        }
      : undefined,
    fs: fsContext,
    fetch: scopedFetch,
    exec: scopedExec,
    secrets: secretsContext,
  };
}
