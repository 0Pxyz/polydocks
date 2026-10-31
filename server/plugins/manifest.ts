import { z } from "zod";

/**
 * Declared granular permissions (default-deny).
 */
export const NetPermissionSchema = z.object({
  type: z.literal("net"),
  hosts: z.array(z.string().min(1)),
});

export const FsPermissionSchema = z.object({
  type: z.literal("fs"),
  scope: z.enum(["workspace", "plugin"]),
  mode: z.enum(["read", "write"]),
});

export const ExecPermissionSchema = z.object({
  type: z.literal("exec"),
  commands: z.array(z.string().min(1)),
});

export const McpPermissionSchema = z.object({
  type: z.literal("mcp"),
  server: z.string().min(1),
});

export const SecretPermissionSchema = z.object({
  type: z.literal("secret"),
  name: z.string().min(1),
});

export const PermissionSchema = z.discriminatedUnion("type", [
  NetPermissionSchema,
  FsPermissionSchema,
  ExecPermissionSchema,
  McpPermissionSchema,
  SecretPermissionSchema,
]);

export type Permission = z.infer<typeof PermissionSchema>;

/**
 * Interactive UI surface exposed by a plugin.
 */
export const SurfaceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  icon: z.string().min(1),
  variant: z.enum(["immersive", "floating", "sheet"]),
  entry: z.string().min(1),
});

export type Surface = z.infer<typeof SurfaceSchema>;

/**
 * Capability risk matrix.
 */
export const CapabilityRiskSchema = z.enum(["read", "write", "destructive", "external"]);
export type CapabilityRisk = z.infer<typeof CapabilityRiskSchema>;

/**
 * Declarative capability specification.
 */
export const CapabilitySchema = z.object({
  id: z.string().min(1), // format: <pluginId>.<action>
  title: z.string().min(1),
  description: z.string().min(1),
  input: z.any(), // Zod schema or JSON schema definition
  output: z.any().optional(),
  risk: CapabilityRiskSchema,
  adapter: z
    .object({
      mcp: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
      http: z.record(z.string(), z.any()).optional(),
      cli: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
});

export type CapabilityManifest = z.infer<typeof CapabilitySchema>;

/**
 * Plugin Manifest Schema (Version 1).
 */
export const PluginManifestSchema = z.object({
  apiVersion: z.literal(1),
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/, "Plugin id must be lowercase alphanumeric with hyphens or underscores"),
  name: z.string().min(1),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, "Version must follow semantic versioning (e.g. 1.0.0)"),
  description: z.string().min(1),
  icon: z.string().min(1),
  trust: z.enum(["core", "first-party", "generated", "external"]),
  capabilities: z.array(CapabilitySchema).default([]),
  surfaces: z.array(SurfaceSchema).optional(),
  permissions: z.array(PermissionSchema).default([]),
  config: z.record(z.string(), z.any()).optional(),
  secrets: z.array(z.string()).optional(),
  skill: z
    .object({
      file: z.string().min(1),
      triggers: z.array(z.string().min(1)),
    })
    .optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/**
 * Validate a raw plugin manifest object against apiVersion 1.
 */
export function validatePluginManifest(manifest: unknown): {
  success: boolean;
  data?: PluginManifest;
  error?: string;
} {
  const result = PluginManifestSchema.safeParse(manifest);
  if (!result.success) {
    const errorMsg = result.error.issues
      .map((issue) => `[${issue.path.join(".")}] ${issue.message}`)
      .join(", ");
    return { success: false, error: errorMsg };
  }
  return { success: true, data: result.data };
}
