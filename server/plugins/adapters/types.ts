import { z } from "zod";

export const HttpAdapterConfigSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  urlTemplate: z.string().min(1),
  queryParams: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  bearerSecret: z.string().optional(),
  bodyTemplate: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
  responsePath: z.string().optional(),
  byteCap: z.number().int().positive().default(1_048_576), // 1MB default cap
});

export type HttpAdapterConfig = z.infer<typeof HttpAdapterConfigSchema>;

export const CliAdapterConfigSchema = z.object({
  bin: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
  workingDir: z.enum(["workspace", "plugin", "root"]).default("workspace"),
  timeoutMs: z.number().int().positive().default(15_000),
  allowStdio: z.boolean().default(false),
});

export type CliAdapterConfig = z.infer<typeof CliAdapterConfigSchema>;

export const McpAdapterConfigSchema = z.object({
  server: z.string().optional(),
  serverUrl: z.string().optional(),
  tool: z.string().optional(),
  transport: z.enum(["http", "sse", "stdio", "streamable"]).default("http"),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  allowStdio: z.boolean().default(false),
  token: z.string().optional(),
});

export type McpAdapterConfig = z.infer<typeof McpAdapterConfigSchema>;
