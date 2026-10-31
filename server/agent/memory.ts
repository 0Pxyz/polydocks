import fs from "node:fs/promises";
import path from "node:path";
import { getMemoryPath, BASELINE_TEMPLATES } from "../system/agentHome";
import { readFileSafe, writeFileSafe } from "../system/filesystem";
import { redactSecrets } from "../plugins/redact";

export interface RecordMemoryOptions {
  content: string;
  category?: "user_preference" | "architectural_rule" | "project_insight" | "tool_usage" | "general" | string;
  durable?: boolean;
  workspaceId?: string;
  rootDir?: string;
}

export interface RecallMemoryOptions {
  query: string;
  category?: string;
  workspaceId?: string;
  maxTokens?: number;
  limit?: number;
  rootDir?: string;
}

export interface DailyLogSummary {
  date: string;
  filename: string;
  content: string;
  entryCount: number;
}

export interface MemoryOverview {
  memoryMd: string;
  dailyLogs: DailyLogSummary[];
}

interface ScoredMemoryItem {
  source: string;
  section?: string;
  category?: string;
  content: string;
  score: number;
  tokens: number;
}

const COMMON_STOP_WORDS = new Set([
  "a", "an", "the", "in", "on", "at", "for", "to", "of", "and", "or", "is",
  "are", "with", "this", "that", "it", "as", "by", "from", "be", "was",
  "were", "which", "who", "whom", "what", "how", "when", "where", "why",
  "can", "could", "should", "would", "do", "does", "did", "have", "has", "had",
  "i", "you", "he", "she", "we", "they", "me", "him", "her", "us", "them",
]);

/**
 * Redacts secrets using both the centralized SecretRedactor and common credential regex patterns.
 */
export function sanitizeMemoryContent(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  // 1. Centralized SecretRedactor
  let sanitized = redactSecrets(raw);

  // 2. Bearer tokens: Bearer <token>
  sanitized = sanitized.replace(/(bearer\s+)[A-Za-z0-9_.-]{16,}/gi, "$1[REDACTED_SECRET]");

  // 3. OpenAI / Anthropic / Meta style API keys (sk-...)
  sanitized = sanitized.replace(/(sk-[a-zA-Z0-9_-]{20,})/gi, "[REDACTED_SECRET]");

  // 4. GitHub / Google / General API key formats
  sanitized = sanitized.replace(/(ghp_[a-zA-Z0-9]{36}|AIza[0-9A-Za-z-_]{35})/g, "[REDACTED_SECRET]");

  // 5. Generic credential patterns in key-value / json / assignment format
  sanitized = sanitized.replace(
    /((?:api[_-]?key|secret|password|auth[_-]?token|access[_-]?token)["']?\s*[:=]\s*["']?)[A-Za-z0-9_.-]{8,}(["']?)/gi,
    "$1[REDACTED_SECRET]$2"
  );

  // 6. Private keys
  sanitized = sanitized.replace(
    /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/gi,
    "[REDACTED_PRIVATE_KEY]"
  );

  return sanitized;
}

/**
 * Maps categories to canonical markdown headers in MEMORY.md.
 */
function getSectionHeaderForCategory(category?: string): string {
  const norm = (category || "").toLowerCase().trim();
  if (norm.includes("pref") || norm.includes("user")) {
    return "## User Insights & Preferences";
  }
  if (norm.includes("arch") || norm.includes("rule")) {
    return "## Architectural Guidelines";
  }
  if (norm.includes("proj") || norm.includes("workspace") || norm.includes("goal")) {
    return "## Active Projects & Workspace Insights";
  }
  if (norm.includes("tool") || norm.includes("plugin") || norm.includes("capab")) {
    return "## Installed Tools & Capabilities";
  }
  return "## General Insights";
}

/**
 * Estimates token count based on standard English character ratio (~4 characters per token).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.trim().length / 4);
}

/**
 * Returns formatted date YYYY-MM-DD.
 */
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns formatted time HH:MM:SS.
 */
function getCurrentTimeString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Records an observation or preference into the episodic daily log and, if durable, MEMORY.md.
 */
export async function recordMemory(
  options: RecordMemoryOptions
): Promise<{ recorded: boolean; entry: string; durable: boolean; dailyFile: string }> {
  const cleanContent = sanitizeMemoryContent(options.content.trim());
  if (!cleanContent) {
    throw new Error("Cannot record empty memory.");
  }

  const category = (options.category || "general").trim();
  const durable = Boolean(options.durable);
  const today = getTodayDateString();
  const time = getCurrentTimeString();
  const dailyRelPath = path.join("memory", `${today}.md`);

  const workspaceTag = options.workspaceId ? ` (workspace: ${options.workspaceId})` : "";
  const entryLine = `- [${time}] [${category}]${workspaceTag}: ${cleanContent}`;

  // 1. Append to episodic daily log (memory/YYYY-MM-DD.md)
  let existingDailyContent = "";
  try {
    const read = await readFileSafe(dailyRelPath, { rootDir: options.rootDir });
    existingDailyContent = read.content;
  } catch {
    // File doesn't exist yet, seed with title
    existingDailyContent = `# Daily Memory Log - ${today}\n\n`;
  }

  const updatedDailyContent = existingDailyContent.trimEnd() + "\n" + entryLine + "\n";
  await writeFileSafe(dailyRelPath, updatedDailyContent, { rootDir: options.rootDir });

  // 2. If marked durable, promote into MEMORY.md under the matching section
  if (durable) {
    await promoteToCuratedMemory(cleanContent, category, options.rootDir);
  }

  return {
    recorded: true,
    entry: entryLine,
    durable,
    dailyFile: dailyRelPath,
  };
}

/**
 * Promotes an insight or rule into agent-home/MEMORY.md under the appropriate heading.
 */
export async function promoteToCuratedMemory(
  content: string,
  category?: string,
  rootDir?: string
): Promise<void> {
  const cleanContent = sanitizeMemoryContent(content.trim());
  if (!cleanContent) return;

  const targetHeader = getSectionHeaderForCategory(category);
  const memoryRelPath = "MEMORY.md";

  let memoryMd = "";
  try {
    const res = await readFileSafe(memoryRelPath, { rootDir });
    memoryMd = res.content;
  } catch {
    memoryMd = BASELINE_TEMPLATES["MEMORY.md"] || "# Long-Term Curated Memory\n\n";
  }

  const bullet = `- ${cleanContent}`;

  // Check if bullet already exists to avoid exact duplicates
  if (memoryMd.includes(bullet)) {
    return;
  }

  // Insert under the target header if present
  if (memoryMd.includes(targetHeader)) {
    const headerIndex = memoryMd.indexOf(targetHeader);
    const afterHeader = headerIndex + targetHeader.length;
    // Find next header or end of file
    const nextHeaderMatch = memoryMd.slice(afterHeader).match(/\n##\s+/);
    if (nextHeaderMatch && nextHeaderMatch.index !== undefined) {
      const insertPos = afterHeader + nextHeaderMatch.index;
      memoryMd =
        memoryMd.slice(0, insertPos).trimEnd() +
        "\n" +
        bullet +
        "\n\n" +
        memoryMd.slice(insertPos).trimStart();
    } else {
      memoryMd = memoryMd.trimEnd() + "\n" + bullet + "\n";
    }
  } else {
    // Append new section at bottom
    memoryMd = memoryMd.trimEnd() + `\n\n${targetHeader}\n${bullet}\n`;
  }

  await writeFileSafe(memoryRelPath, memoryMd, { rootDir });
}

/**
 * Retrieves the most relevant memories matching a query from MEMORY.md and recent daily logs.
 */
export async function recallMemory(options: RecallMemoryOptions): Promise<string[]> {
  const query = (options.query || "").trim();
  const maxTokens = options.maxTokens ?? 800;
  const limit = options.limit ?? 15;
  const targetCategory = options.category?.toLowerCase().trim();
  const targetWorkspace = options.workspaceId?.toLowerCase().trim();

  const queryTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !COMMON_STOP_WORDS.has(w));

  const items: ScoredMemoryItem[] = [];

  // 1. Parse MEMORY.md
  try {
    const memRes = await readFileSafe("MEMORY.md", { rootDir: options.rootDir });
    const lines = memRes.content.split(/\r?\n/);
    let currentSection = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("## ")) {
        currentSection = trimmed;
        continue;
      }
      if (trimmed.startsWith("- ")) {
        const itemContent = trimmed.slice(2).trim();
        if (itemContent) {
          items.push({
            source: "MEMORY.md",
            section: currentSection,
            content: itemContent,
            score: 0,
            tokens: estimateTokens(itemContent),
          });
        }
      }
    }
  } catch {
    // MEMORY.md not available or readable yet
  }

  // 2. Parse daily logs in memory/
  try {
    const memoryDir = options.rootDir
      ? path.join(options.rootDir, "memory")
      : getMemoryPath();

    const dirEntries = await fs.readdir(memoryDir).catch(() => [] as string[]);
    const mdFiles = dirEntries.filter((f) => f.endsWith(".md")).sort().reverse();

    // Inspect up to last 14 logs
    for (const filename of mdFiles.slice(0, 14)) {
      const date = filename.replace(/\.md$/, "");
      try {
        const res = await readFileSafe(path.join("memory", filename), { rootDir: options.rootDir });
        const lines = res.content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("- [")) {
            // Format: - [HH:MM:SS] [category] (workspace: id): content
            const match = trimmed.match(/^- \[[^\]]+\] (?:\[([^\]]+)\])?(?:\s*\(workspace:\s*([^)]+)\))?:\s*(.+)$/);
            const category = match?.[1]?.trim();
            const workspace = match?.[2]?.trim();
            const text = match?.[3]?.trim() || trimmed.slice(2);

            items.push({
              source: filename,
              category,
              content: text,
              score: date === getTodayDateString() ? 1.0 : 0.5, // Small recency bias
              tokens: estimateTokens(text),
            });

            // Filter workspace if specified
            if (targetWorkspace && workspace && workspace.toLowerCase() !== targetWorkspace) {
              // Exclude if workspace explicitly doesn't match
              items[items.length - 1].score = -100;
            }
          }
        }
      } catch {
        // Skip unreadable log
      }
    }
  } catch {
    // Daily logs directory not available
  }

  // 3. Compute relevance scores
  const queryLower = query.toLowerCase();

  for (const item of items) {
    if (item.score < 0) continue;

    const contentLower = item.content.toLowerCase();
    const sectionLower = (item.section || "").toLowerCase();
    const categoryLower = (item.category || "").toLowerCase();

    // Exact phrase match
    if (queryLower.length >= 4 && contentLower.includes(queryLower)) {
      item.score += 6.0;
    }

    // Keyword matches
    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        item.score += 2.5;
      }
      if (sectionLower.includes(term)) {
        item.score += 1.5;
      }
      if (categoryLower.includes(term)) {
        item.score += 2.0;
      }
    }

    // Category filter matching
    if (targetCategory) {
      if (categoryLower === targetCategory || sectionLower.includes(targetCategory)) {
        item.score += 3.0;
      } else {
        item.score -= 2.0;
      }
    }
  }

  // Filter items that have meaningful relevance (score > 1.0 or if no query terms, score > 0)
  const minScore = queryTerms.length > 0 ? 1.5 : 0;
  const filtered = items.filter((item) => item.score > minScore);

  // Sort descending by score
  filtered.sort((a, b) => b.score - a.score);

  // Apply token clamping and limit
  const results: string[] = [];
  let currentTokens = 0;

  for (const item of filtered) {
    if (results.length >= limit) break;
    if (currentTokens + item.tokens > maxTokens) {
      break;
    }
    // Deduplicate identical content
    if (!results.includes(item.content)) {
      results.push(item.content);
      currentTokens += item.tokens;
    }
  }

  return results;
}

/**
 * Returns formatted contextual markdown block for system prompt injection.
 * Guaranteed to respect maxTokens budget (default 800 tokens max).
 */
export async function getMemoryContext(
  prompt: string,
  maxTokens: number = 800,
  rootDir?: string
): Promise<string> {
  const memories = await recallMemory({
    query: prompt,
    maxTokens,
    rootDir,
  });

  if (memories.length === 0) {
    return "";
  }

  const memoryBullets = memories.map((m) => `- ${m}`).join("\n");
  const block = `## Recalled Agent Memory & User Context\nThe following persistent memories from previous sessions are relevant to the active context:\n${memoryBullets}`;

  // Strict safety clamp on token budget
  if (estimateTokens(block) > maxTokens) {
    const maxChars = maxTokens * 4;
    return block.slice(0, maxChars) + "\n... [memory truncated to token budget]";
  }

  return block;
}

/**
 * Returns an overview of MEMORY.md and recent daily logs for user inspection.
 */
export async function getMemoryOverview(rootDir?: string): Promise<MemoryOverview> {
  let memoryMd = "";
  try {
    const res = await readFileSafe("MEMORY.md", { rootDir });
    memoryMd = res.content;
  } catch {
    memoryMd = BASELINE_TEMPLATES["MEMORY.md"] || "# Long-Term Curated Memory\n";
  }

  const dailyLogs: DailyLogSummary[] = [];
  try {
    const memoryDir = rootDir ? path.join(rootDir, "memory") : getMemoryPath();
    const entries = await fs.readdir(memoryDir).catch(() => [] as string[]);
    const mdFiles = entries.filter((f) => f.endsWith(".md")).sort().reverse();

    for (const filename of mdFiles) {
      const date = filename.replace(/\.md$/, "");
      try {
        const res = await readFileSafe(path.join("memory", filename), { rootDir });
        const entryCount = res.content
          .split(/\r?\n/)
          .filter((line) => line.trim().startsWith("- [")).length;

        dailyLogs.push({
          date,
          filename,
          content: res.content,
          entryCount,
        });
      } catch {
        // Skip unreadable file
      }
    }
  } catch {
    // Memory dir not initialized
  }

  return {
    memoryMd,
    dailyLogs,
  };
}

/**
 * Updates MEMORY.md with new content, automatically redacting any sensitive tokens.
 */
export async function updateMemoryMd(
  content: string,
  rootDir?: string
): Promise<{ path: string; bytesWritten: number }> {
  const sanitized = sanitizeMemoryContent(content);
  return await writeFileSafe("MEMORY.md", sanitized, { rootDir, overwrite: true });
}

export interface DeleteMemoryEntryOptions {
  /** Substring matched against the entry text (sanitized before compare). */
  content: string;
  /** Where to delete from. `all` tries curated first, then the daily log. */
  scope?: "curated" | "daily" | "all";
  /** Daily log date `YYYY-MM-DD` for scope daily (defaults to today). */
  date?: string;
  rootDir?: string;
}

/**
 * Deletes a single memory entry by content match (#105 inspector backend).
 * Removes the first matching line only so one UI delete never wipes
 * duplicates. Returns which scope lost the entry.
 */
export async function deleteMemoryEntry(
  options: DeleteMemoryEntryOptions
): Promise<{ removed: boolean; scope: string | null }> {
  const needle = sanitizeMemoryContent((options.content || "").trim());
  if (!needle) throw new Error("Missing required 'content' field for delete.");
  const scope = options.scope ?? "all";

  if (scope === "curated" || scope === "all") {
    try {
      const res = await readFileSafe("MEMORY.md", { rootDir: options.rootDir });
      const lines = res.content.split("\n");
      const idx = lines.findIndex(
        (line) => line.trim().startsWith("-") && line.includes(needle)
      );
      if (idx >= 0) {
        lines.splice(idx, 1);
        await writeFileSafe("MEMORY.md", lines.join("\n"), {
          rootDir: options.rootDir,
          overwrite: true,
        });
        return { removed: true, scope: "curated" };
      }
    } catch {
      // No curated file yet — fall through to daily when scope is all.
    }
    if (scope === "curated") return { removed: false, scope: null };
  }

  const date = (options.date || "").trim() || getTodayDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid 'date', expected YYYY-MM-DD.");
  try {
    const rel = path.join("memory", `${date}.md`);
    const res = await readFileSafe(rel, { rootDir: options.rootDir });
    const lines = res.content.split("\n");
    const idx = lines.findIndex(
      (line) => line.trim().startsWith("- [") && line.includes(needle)
    );
    if (idx < 0) return { removed: false, scope: null };
    lines.splice(idx, 1);
    await writeFileSafe(rel, lines.join("\n"), { rootDir: options.rootDir, overwrite: true });
    return { removed: true, scope: "daily" };
  } catch {
    return { removed: false, scope: null };
  }
}
