import fs from "node:fs/promises";
import path from "node:path";

export const AGENT_HOME_SUBDIRS = [
  "memory",
  "sessions",
  "workspaces",
  "plugins",
  "tasks",
  "artifacts",
  "settings",
] as const;

export type AgentHomeSubdir = (typeof AGENT_HOME_SUBDIRS)[number];

export const BASELINE_TEMPLATES: Record<string, string> = {
  "AGENTS.md": `# Agent Operational Guidelines & Conventions

Welcome to the Polydocks Agent Home. This environment serves as your persistent base of operations, memory, and deliverable storage.

## Core Rules
1. **Safety & Confinement**: All autonomous filesystem operations must stay confined within \`agent-home/\` or explicitly user-granted workspace boundaries. Never attempt path traversal (\`../\`) or escaping symlinks.
2. **Atomic Modifications**: Always perform atomic writes and targeted drop-in edits. Preserve user formatting, comments, and structure.
3. **Transparent Execution**: Document key decisions, user preferences, and project context into \`memory/\` and \`MEMORY.md\`.
4. **Dock-First Control**: Control the Agentic Dock, synthesize dynamic surfaces when needed, and maintain single-viewport focus.
5. **Zero Secrets**: Never log, store, or output private API keys or bearer tokens in plain text.
`,
  "SOUL.md": `# Agent Identity & Ethos

You are **Polydocks**, an autonomous Agentic Dock operator, knowledge architect, and pedagogical companion.

## Principles
- **Dock-First**: You do not live in an endless conversational chat feed. The dock is your primary control surface.
- **Pedagogical Autonomy**: Question, guide, and surface authoritative primary sources. Challenge assumptions, foster curiosity, and never rob the user of learning by handing out pre-chewed summaries.
- **Elegance & Precision**: Adhere to dark-only design aesthetics, clean typography, and concise communication.
- **Reflective Agency**: When an operation or capability fails, inspect recent logs, adjust parameters, and try alternative strategies thoughtfully.
`,
  "USER.md": `# User Profile & Working Style

This document records the user's active goals, preferences, and context to personalize knowledge exploration and workspace generation.

## Profile
- **Role / Interests**: Polymath, curious builder, knowledge explorer.
- **Communication Style**: Direct, concise, technical, no unnecessary fluff.
- **Learning Mode**: Socratic, interactive, depth over superficial breadth.

## Active Goals
- Master complex domains through structured roadmaps and living notes.
`,
  "MEMORY.md": `# Long-Term Curated Memory

This file contains durable architectural choices, user preferences, and persistent project insights across sessions.

## Architectural Guidelines
- Everything is a capability behind a typed contract on the capability bus.
- Experiences run in sandboxed iframes and communicate strictly through the bridge protocol.
- The persistent agent home (\`agent-home/\`) isolates operational data, memory, and task artifacts.

## User Insights & Preferences
- Prefers dark, frameless, clutter-free interfaces.
- Values primary research sources (papers, documentation, original texts) over secondary opinions.
`,
};

export interface AgentHomeInfo {
  root: string;
  subdirs: string[];
  filesCreated: string[];
  filesPreserved: string[];
}

/**
 * Returns the resolved root path of the agent home directory.
 * Prioritizes process.env.AGENT_HOME_DIR, otherwise defaults to <cwd>/agent-home.
 */
export function getAgentHomeRoot(): string {
  const envDir = process.env.AGENT_HOME_DIR;
  if (envDir && envDir.trim().length > 0) {
    return path.resolve(envDir.trim());
  }
  return path.resolve(process.cwd(), "agent-home");
}

/**
 * Resolves a path relative to the agent-home root directory.
 */
export function getAgentHomePath(...subpaths: string[]): string {
  return path.join(getAgentHomeRoot(), ...subpaths);
}

export function getMemoryPath(...subpaths: string[]): string {
  return getAgentHomePath("memory", ...subpaths);
}

export function getSessionsPath(...subpaths: string[]): string {
  return getAgentHomePath("sessions", ...subpaths);
}

export function getWorkspacesPath(...subpaths: string[]): string {
  return getAgentHomePath("workspaces", ...subpaths);
}

export function getPluginsPath(...subpaths: string[]): string {
  return getAgentHomePath("plugins", ...subpaths);
}

export function getTasksPath(...subpaths: string[]): string {
  return getAgentHomePath("tasks", ...subpaths);
}

export function getArtifactsPath(...subpaths: string[]): string {
  return getAgentHomePath("artifacts", ...subpaths);
}

export function getSettingsPath(...subpaths: string[]): string {
  return getAgentHomePath("settings", ...subpaths);
}

/**
 * Bootstraps the agent-home filesystem tree on server startup.
 * Creates all subdirectories and seeds default template markdown files if they don't exist.
 * Idempotent: Existing files and edits are strictly preserved.
 */
export async function initAgentHome(customRoot?: string): Promise<AgentHomeInfo> {
  const root = customRoot ? path.resolve(customRoot) : getAgentHomeRoot();

  // 1. Ensure root directory exists
  await fs.mkdir(root, { recursive: true });

  // 2. Ensure all standard subdirectories exist
  const subdirsCreated: string[] = [];
  for (const dir of AGENT_HOME_SUBDIRS) {
    const fullPath = path.join(root, dir);
    await fs.mkdir(fullPath, { recursive: true });
    subdirsCreated.push(dir);
  }

  // 3. Seed baseline template markdown files if not already present
  const filesCreated: string[] = [];
  const filesPreserved: string[] = [];

  for (const [filename, template] of Object.entries(BASELINE_TEMPLATES)) {
    const filePath = path.join(root, filename);
    let exists = false;
    try {
      await fs.access(filePath);
      exists = true;
    } catch {
      exists = false;
    }

    if (!exists) {
      await fs.writeFile(filePath, template, "utf-8");
      filesCreated.push(filename);
    } else {
      filesPreserved.push(filename);
    }
  }

  return {
    root,
    subdirs: subdirsCreated,
    filesCreated,
    filesPreserved,
  };
}
