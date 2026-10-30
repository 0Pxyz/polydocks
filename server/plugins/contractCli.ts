import { invokeCapability } from "../facade/shared";

/**
 * CLI surface for contract capabilities: `polydocks <plugin> <capability>
 * [--key value ...] [--city id] [--json]`.
 *
 * Flags map 1:1 onto the capability zod input schema (values JSON-parse
 * when possible so numbers/booleans survive the shell). Output is the
 * same envelope the agent and HTTP route receive.
 */
export interface ContractCliOptions {
  json?: boolean;
  city?: string;
  workspace?: string;
}

export function parseContractFlags(rawArgs: string[]): {
  input: Record<string, unknown>;
  city?: string;
  workspace?: string;
  rest: string[];
} {
  const input: Record<string, unknown> = {};
  const rest: string[] = [];
  let city: string | undefined;
  let workspace: string | undefined;
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (!arg.startsWith("--")) {
      rest.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "city") {
      city = rawArgs[++i];
      continue;
    }
    if (key === "workspace" || key === "w") {
      workspace = rawArgs[++i];
      continue;
    }
    if (key === "json") continue;
    const next = rawArgs[i + 1];
    if (next === undefined || next.startsWith("--")) {
      input[key] = true;
      continue;
    }
    i++;
    try {
      input[key] = JSON.parse(next);
    } catch {
      input[key] = next;
    }
  }
  return { input, city, workspace, rest };
}

export function isContractPlugin(command: string): boolean {
  // A contract plugin command is any plugin id with registered contract
  // capabilities (sources, cities, ...). Checked lazily at dispatch.
  return command.length > 0;
}

export async function runContractCommand(
  pluginId: string,
  capability: string | undefined,
  rawArgs: string[],
  opts: ContractCliOptions
): Promise<{ found: boolean; envelope?: unknown; exitCode?: number }> {
  if (!capability) return { found: false };
  const { input, city, workspace } = parseContractFlags(rawArgs);
  const cityId = opts.city || city || opts.workspace || workspace;
  if (!input.cityId && cityId) input.cityId = cityId;
  const envelope = await invokeCapability(pluginId, capability, input, { actor: "user", cityId });
  if (!envelope.ok) {
    return { found: true, envelope, exitCode: 1 };
  }
  return { found: true, envelope, exitCode: (envelope as any).ok ? 0 : 1 };
}
