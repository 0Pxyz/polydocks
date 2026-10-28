import path from "node:path";
import type { ExecutionContext } from "../bus";
import { CliAdapterConfigSchema } from "./types";
import { interpolateString } from "./http";

/**
 * Expand and interpolate argv array safely without shell interpolation.
 */
export function resolveArgv(args: string[], input: unknown): string[] {
  const result: string[] = [];

  for (const arg of args) {
    // If the entire arg is a token like "{files}" and input.files is an array, expand each element
    const arrayMatch = arg.match(/^\{([a-zA-Z0-9_.-]+)\}$/);
    if (arrayMatch && input !== null && typeof input === "object") {
      const val = (input as Record<string, unknown>)[arrayMatch[1]];
      if (Array.isArray(val)) {
        for (const item of val) {
          result.push(String(item));
        }
        continue;
      }
    }

    // Otherwise standard token replacement
    const interpolated = interpolateString(arg, input, false);
    result.push(interpolated);
  }

  return result;
}

/**
 * Declarative CLI capability executor.
 * Strictly uses argument array execution without shell interpolation.
 */
export async function executeCliAdapter(
  rawConfig: unknown,
  input: unknown,
  ctx: ExecutionContext
): Promise<{ stdout: string; stderr: string; exitCode: number; skipped?: boolean; reason?: string }> {
  const parseResult = CliAdapterConfigSchema.safeParse(rawConfig);
  if (!parseResult.success) {
    throw new Error(`Invalid CLI adapter configuration: ${parseResult.error.message}`);
  }
  const config = parseResult.data;

  // Validate binary name (no directory separators or shell metacharacters)
  if (!/^[a-zA-Z0-9_.-]+$/.test(config.bin)) {
    throw new Error(`Invalid or unsafe binary name: "${config.bin}"`);
  }

  // 1. Resolve argument list without shell interpolation
  const resolvedArgs = resolveArgv(config.args, input);

  // 2. Resolve working directory confined to city or workspace
  let cwd: string | undefined;
  if (ctx.fs?.rootDir) {
    cwd = ctx.fs.rootDir;
  } else if (ctx.cityId) {
    cwd = path.resolve(process.cwd(), "workspace", ctx.cityId);
  } else {
    cwd = path.resolve(process.cwd(), "workspace");
  }

  // 3. Execute via scoped exec context
  if (!ctx.exec) {
    throw new Error("Scoped exec context is missing from execution environment.");
  }

  try {
    const res = await ctx.exec(config.bin, resolvedArgs, {
      timeoutMs: config.timeoutMs,
      cwd,
    });

    return {
      stdout: res.stdout,
      stderr: res.stderr,
      exitCode: res.exitCode,
    };
  } catch (err: any) {
    // Handle binary missing gracefully (e.g. git not installed)
    const errMsg = String(err.message || err);
    if (errMsg.includes("ENOENT") || errMsg.includes("not found")) {
      return {
        stdout: "",
        stderr: errMsg,
        exitCode: 127,
        skipped: true,
        reason: `Command "${config.bin}" is not installed or available on the host system.`,
      };
    }
    throw err;
  }
}
