import { z } from "zod";
import { defineCapability } from "./contract";
import { pluginRegistry } from "./registry";
import { editFileSafe, listFiles, readFileSafe, searchFiles, writeFileSafe } from "../system/filesystem";

/**
 * Files first-party plugin (contract-based).
 *
 * Agent-home file access as typed bus capabilities. Thin wrappers over the
 * same `server/system/filesystem.ts` executors the native agent tools use —
 * same root, same traversal guards, no second implementation. Scope is
 * global (agent-home), not workspace: these files are the agent's own disk.
 */
export function registerFilesPlugin(): void {
  defineCapability({
    plugin: "files",
    name: "list",
    title: "List Files",
    description: "Lists files and directories in agent-home. Defaults to the root.",
    scope: "global",
    input: z.object({
      path: z.string().optional().describe("Directory relative to agent-home (default '.')"),
      recursive: z.boolean().optional(),
      maxDepth: z.number().int().positive().optional(),
    }),
    emits: [],
    risk: "read",
    handler: async (input) => {
      const entries = await listFiles(input.path || ".", {
        recursive: input.recursive,
        maxDepth: input.maxDepth,
      });
      return { ok: true as const, data: { path: input.path || ".", entries } };
    },
  });

  defineCapability({
    plugin: "files",
    name: "read",
    title: "Read File",
    description: "Reads a text file from agent-home with line pagination.",
    scope: "global",
    input: z.object({
      path: z.string().min(1).describe("File path relative to agent-home"),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().positive().optional(),
    }),
    emits: [],
    risk: "read",
    handler: async (input) => {
      const result = await readFileSafe(input.path, { offset: input.offset, limit: input.limit });
      return { ok: true as const, data: result };
    },
  });

  defineCapability({
    plugin: "files",
    name: "write",
    title: "Write File",
    description: "Creates or overwrites a text file in agent-home.",
    scope: "global",
    input: z.object({
      path: z.string().min(1).describe("File path relative to agent-home"),
      content: z.string().describe("Full file content"),
    }),
    emits: [],
    risk: "write",
    handler: async (input) => {
      const result = await writeFileSafe(input.path, input.content);
      return { ok: true as const, data: result };
    },
  });

  defineCapability({
    plugin: "files",
    name: "edit",
    title: "Edit File",
    description: "Surgically replaces one unique target string in an agent-home file.",
    scope: "global",
    input: z.object({
      path: z.string().min(1).describe("File path relative to agent-home"),
      target: z.string().min(1).describe("Exact string to replace (must match once)"),
      replacement: z.string().describe("Replacement string"),
    }),
    emits: [],
    risk: "write",
    handler: async (input) => {
      const result = await editFileSafe(input.path, input.target, input.replacement);
      return { ok: true as const, data: result };
    },
  });

  defineCapability({
    plugin: "files",
    name: "search",
    title: "Search Files",
    description: "Searches agent-home file contents for a pattern.",
    scope: "global",
    input: z.object({
      pattern: z.string().min(1).describe("Search pattern"),
      path: z.string().optional().describe("Directory relative to agent-home (default '.')"),
    }),
    emits: [],
    risk: "read",
    handler: async (input) => {
      const result = await searchFiles(input.pattern, { path: input.path || "." });
      return { ok: true as const, data: result };
    },
  });

  // Contract rows default to first-party; core membership is the trust flag.
  const existing = pluginRegistry.get("files");
  if (existing) {
    pluginRegistry.install({
      ...existing.manifest,
      name: "Files",
      description: "Agent-home files as typed capabilities",
      icon: "FolderOpen",
      trust: "core",
    });
  }
}
