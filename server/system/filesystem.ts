import fs from "node:fs/promises";
import path from "node:path";
import { getAgentHomeRoot } from "./agentHome";

export interface FileEntry {
  name: string;
  path: string; // Relative to agent-home
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

export interface ReadFileResult {
  content: string;
  totalLines: number;
  offset: number;
  limit?: number;
  byteLength: number;
  truncated: boolean;
}

export interface SearchMatch {
  file: string; // Relative to agent-home
  line: number;
  text: string;
}

export interface SearchResult {
  query: string;
  matches: SearchMatch[];
  totalMatches: number;
  filesSearched: number;
}

/**
 * Resolves a relative path safely within the agent-home root boundary.
 * Strictly prevents path traversal attacks (e.g. "../", encoded separators, null bytes)
 * and verifies that symlinks do not escape the sandbox boundary.
 */
export async function resolveSafeAgentPath(
  relPath: string,
  customRoot?: string
): Promise<string> {
  const root = customRoot ? path.resolve(customRoot) : getAgentHomeRoot();

  // Reject null bytes or suspicious control characters
  if (!relPath || relPath.includes("\0")) {
    throw new Error("Invalid path: contains illegal characters or null bytes.");
  }

  // Resolve normalized path
  const target = path.resolve(root, relPath);

  // Path containment check
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Path traversal violation: Attempted access outside agent-home (${relPath})`);
  }

  // If path exists on disk, verify symlink realpath containment
  let exists = false;
  try {
    await fs.access(target);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists) {
    try {
      const real = await fs.realpath(target);
      if (real !== root && !real.startsWith(root + path.sep)) {
        throw new Error(`Symlink escape violation: Target escapes agent-home root (${relPath})`);
      }
    } catch (err: any) {
      if (err.message.includes("Symlink escape violation")) {
        throw err;
      }
    }
  } else {
    // If target does not exist yet (e.g. new file), check its closest existing ancestor
    let curr = path.dirname(target);
    while (curr.startsWith(root + path.sep) || curr === root) {
      try {
        await fs.access(curr);
        const realCurr = await fs.realpath(curr);
        if (realCurr !== root && !realCurr.startsWith(root + path.sep)) {
          throw new Error(`Symlink escape violation: Parent directory escapes agent-home (${relPath})`);
        }
        break;
      } catch {
        curr = path.dirname(curr);
      }
    }
  }

  return target;
}

/**
 * List files and directories within agent-home.
 */
export async function listFiles(
  relPath = ".",
  options?: { recursive?: boolean; maxDepth?: number; rootDir?: string }
): Promise<FileEntry[]> {
  const targetDir = await resolveSafeAgentPath(relPath, options?.rootDir);
  const root = options?.rootDir ? path.resolve(options.rootDir) : getAgentHomeRoot();
  const recursive = options?.recursive ?? false;
  const maxDepth = options?.maxDepth ?? (recursive ? 5 : 1);

  const entries: FileEntry[] = [];

  async function scan(currentDir: string, depth: number) {
    if (depth > maxDepth) return;

    let dirEntries;
    try {
      dirEntries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      // Skip hidden files and temp files by default
      if (entry.name.startsWith(".") && entry.name !== ".gitkeep") continue;

      const fullPath = path.join(currentDir, entry.name);
      const relToRoot = path.relative(root, fullPath);

      let stats;
      try {
        stats = await fs.stat(fullPath);
      } catch {
        continue;
      }

      entries.push({
        name: entry.name,
        path: relToRoot,
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      });

      if (entry.isDirectory() && recursive && depth < maxDepth) {
        await scan(fullPath, depth + 1);
      }
    }
  }

  await scan(targetDir, 1);
  return entries;
}

/**
 * Read text file with strict byte size limits and line pagination.
 */
export async function readFileSafe(
  relPath: string,
  options?: { offset?: number; limit?: number; maxBytes?: number; rootDir?: string }
): Promise<ReadFileResult> {
  const filePath = await resolveSafeAgentPath(relPath, options?.rootDir);
  const maxBytes = options?.maxBytes ?? 51_200; // 50KB default cap

  let rawContent: string;
  try {
    rawContent = await fs.readFile(filePath, "utf-8");
  } catch (err: any) {
    throw new Error(`Failed to read file "${relPath}": ${err.message}`);
  }

  const allLines = rawContent.split(/\r?\n/);
  const totalLines = allLines.length;

  const offset = Math.max(0, options?.offset ?? 0);
  const limit = options?.limit !== undefined ? Math.max(1, options.limit) : undefined;

  let selectedLines = allLines.slice(offset, limit !== undefined ? offset + limit : undefined);
  let content = selectedLines.join("\n");
  let truncated = false;

  // Check maxBytes cap
  if (Buffer.byteLength(content, "utf-8") > maxBytes) {
    // Truncate to safe byte limit
    const buffer = Buffer.from(content, "utf-8");
    content = buffer.subarray(0, maxBytes).toString("utf-8") + "\n... [truncated: file exceeded byte cap]";
    truncated = true;
  } else if (limit !== undefined && offset + limit < totalLines) {
    truncated = true;
  }

  return {
    content,
    totalLines,
    offset,
    limit,
    byteLength: Buffer.byteLength(content, "utf-8"),
    truncated,
  };
}

/**
 * Atomically write content to a file in agent-home.
 * Automatically creates parent directories and uses atomic file renaming.
 */
export async function writeFileSafe(
  relPath: string,
  content: string,
  options?: { overwrite?: boolean; rootDir?: string }
): Promise<{ path: string; bytesWritten: number }> {
  const filePath = await resolveSafeAgentPath(relPath, options?.rootDir);
  const overwrite = options?.overwrite ?? true;

  // Check if file already exists
  let exists = false;
  try {
    await fs.access(filePath);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists && !overwrite) {
    throw new Error(`File already exists at "${relPath}" and overwrite is disabled.`);
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(filePath);
  await fs.mkdir(parentDir, { recursive: true });

  // Atomic write via temporary file
  const tmpName = `.${path.basename(filePath)}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  const tmpPath = path.join(parentDir, tmpName);

  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);

  return {
    path: relPath,
    bytesWritten: Buffer.byteLength(content, "utf-8"),
  };
}

/**
 * Edit a file by applying an exact targeted replacement.
 * Strictly verifies that the target text exists and appears exactly once to prevent ambiguous edits.
 */
export async function editFileSafe(
  relPath: string,
  target: string,
  replacement: string,
  options?: { rootDir?: string }
): Promise<{ path: string; replacements: number }> {
  const filePath = await resolveSafeAgentPath(relPath, options?.rootDir);

  let currentContent: string;
  try {
    currentContent = await fs.readFile(filePath, "utf-8");
  } catch (err: any) {
    throw new Error(`Failed to read file for editing at "${relPath}": ${err.message}`);
  }

  if (!target || target.length === 0) {
    throw new Error("Edit target string must be non-empty.");
  }

  // Count occurrences
  let count = 0;
  let pos = currentContent.indexOf(target);
  while (pos !== -1) {
    count++;
    pos = currentContent.indexOf(target, pos + target.length);
  }

  if (count === 0) {
    throw new Error(`Edit failed: Target text was not found in "${relPath}".`);
  }

  if (count > 1) {
    throw new Error(
      `Edit failed: Target text appears ${count} times in "${relPath}". Please provide more surrounding context to disambiguate.`
    );
  }

  const updatedContent = currentContent.replace(target, replacement);
  await writeFileSafe(relPath, updatedContent, { overwrite: true, rootDir: options?.rootDir });

  return {
    path: relPath,
    replacements: 1,
  };
}

/**
 * Search text files across agent-home for a keyword or regex pattern.
 */
export async function searchFiles(
  query: string,
  options?: { path?: string; extension?: string; maxMatches?: number; rootDir?: string }
): Promise<SearchResult> {
  const searchRoot = await resolveSafeAgentPath(options?.path || ".", options?.rootDir);
  const root = options?.rootDir ? path.resolve(options.rootDir) : getAgentHomeRoot();
  const maxMatches = options?.maxMatches ?? 100;
  const extFilter = options?.extension?.toLowerCase();

  let regex: RegExp;
  try {
    regex = new RegExp(query, "i");
  } catch {
    // Escape literal if query is not valid regex
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(escaped, "i");
  }

  const matches: SearchMatch[] = [];
  let filesSearched = 0;

  async function walk(dir: string) {
    if (matches.length >= maxMatches) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (matches.length >= maxMatches) break;
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (extFilter && !entry.name.toLowerCase().endsWith(extFilter)) {
          continue;
        }

        try {
          const stats = await fs.stat(fullPath);
          // Skip files larger than 1MB
          if (stats.size > 1_048_576) continue;

          const text = await fs.readFile(fullPath, "utf-8");
          filesSearched++;
          const lines = text.split(/\r?\n/);

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxMatches) break;
            if (regex.test(lines[i])) {
              matches.push({
                file: path.relative(root, fullPath),
                line: i + 1,
                text: lines[i].trim(),
              });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  await walk(searchRoot);

  return {
    query,
    matches,
    totalMatches: matches.length,
    filesSearched,
  };
}
