import fs from "node:fs";
import path from "node:path";

/**
 * Principle-based main prompt (#208): identity, mental model, invariants,
 * decision style, economy. Stored as a versioned file, not an inline
 * string, so prompt changes review as content diffs. No numbered
 * procedures — the model reasons from principles.
 */

export interface MainPrompt {
  version: number;
  text: string;
}

function parseMainPrompt(raw: string): MainPrompt {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { version: 0, text: raw.trim() };
  const versionMatch = match[1].match(/version:\s*(\d+)/);
  return { version: versionMatch ? Number(versionMatch[1]) : 0, text: match[2].trim() };
}

export function loadMainPrompt(): MainPrompt {
  const filePath = path.join(import.meta.dir, "main.md");
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = parseMainPrompt(raw);
  if (!parsed.text) throw new Error(`Main prompt is empty: ${filePath}`);
  return parsed;
}

let cached: MainPrompt | null = null;

/** Read once; prompt changes require a restart (same as skill files). */
export function getMainPrompt(): MainPrompt {
  if (!cached) cached = loadMainPrompt();
  return cached;
}

const promptCache = new Map<string, MainPrompt>();

/** Read-once loader for any versioned prompt file in this directory. */
export function getPrompt(name: string): MainPrompt {
  const hit = promptCache.get(name);
  if (hit) return hit;
  const raw = fs.readFileSync(path.join(import.meta.dir, `${name}.md`), "utf-8");
  const parsed = parseMainPrompt(raw);
  if (!parsed.text) throw new Error(`Prompt is empty: ${name}.md`);
  promptCache.set(name, parsed);
  return parsed;
}

/** Testing seam: reset the cached prompt. */
export function resetMainPromptCache(): void {
  cached = null;
  promptCache.clear();
}
