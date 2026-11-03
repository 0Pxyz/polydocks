import { z } from "zod";

export const McpServerDefSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  transport: z.enum(["streamable", "sse", "http", "stdio"]).default("streamable"),
  token: z.string().optional(),
  tokenEnv: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  headers: z.record(z.string(), z.string()).default({}),
  timeoutMs: z.number().int().positive().default(30_000),
  enabled: z.boolean().default(true),
});

export type McpServerDef = z.infer<typeof McpServerDefSchema>;

export const McpServersConfigSchema = z.object({
  servers: z.array(McpServerDefSchema).default([]),
});

export type McpServersConfig = z.infer<typeof McpServersConfigSchema>;

function resolveToken(def: McpServerDef): string | undefined {
  if (def.token) return def.token;
  if (def.tokenEnv) {
    const v = process.env[def.tokenEnv];
    if (v && v.trim().length > 0) return v;
  }
  return undefined;
}

export function withResolvedToken(def: McpServerDef): McpServerDef {
  return { ...def, token: resolveToken(def) };
}

/**
 * Load MCP server definitions from env.
 * MCP_SERVERS_JSON: JSON array or { servers: [...] }.
 * Tokens should use tokenEnv pointing at a secret env var, never inline.
 */
export function loadMcpServersFromEnv(env: NodeJS.ProcessEnv = process.env): McpServerDef[] {
  const raw = env.MCP_SERVERS_JSON;
  if (!raw || raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : parsed.servers;
    if (!Array.isArray(arr)) return [];
    const out: McpServerDef[] = [];
    for (const item of arr) {
      const r = McpServerDefSchema.safeParse(item);
      if (r.success) out.push(withResolvedToken(r.data));
    }
    return out;
  } catch {
    return [];
  }
}

export function cleanServerName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}
