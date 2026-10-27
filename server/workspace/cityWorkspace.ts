import fs from "node:fs/promises";
import path from "node:path";

/**
 * Resolves a target path safely inside the specified city workspace.
 * Defends against path traversal (../) and symlink directory escapes.
 */
export async function resolveSafeCityPath(cityId: string, relativePath: string): Promise<string> {
  if (!cityId || cityId.includes("..") || path.isAbsolute(cityId)) {
    throw new Error(`Security Violation: Invalid city identifier "${cityId}"`);
  }

  const workspaceRoot = path.resolve(process.cwd(), "workspace");
  const cityRoot = path.resolve(workspaceRoot, cityId);
  const targetPath = path.resolve(cityRoot, relativePath);

  // Path traversal check
  if (!targetPath.startsWith(cityRoot)) {
    throw new Error(`Security Violation: Path traversal detected outside city "${cityId}"`);
  }

  // Ensure city directory exists
  await fs.mkdir(cityRoot, { recursive: true });

  // Symlink escape defense
  try {
    const realRoot = await fs.realpath(cityRoot);
    const realTarget = await fs.realpath(targetPath);
    if (!realTarget.startsWith(realRoot)) {
      throw new Error(`Security Violation: Symlink escape detected in city "${cityId}"`);
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }

  return targetPath;
}

export interface CityContext {
  cityId: string;
  metadata?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
  notes: string[];
  sources: string[];
  tabs: string[];
}

/**
 * Retrieves the filesystem-based context of a city workspace.
 */
export async function getCityContext(cityId: string): Promise<CityContext> {
  const cityRoot = await resolveSafeCityPath(cityId, ".");

  let metadata: Record<string, unknown> | undefined;
  let workspace: Record<string, unknown> | undefined;

  try {
    const raw = await fs.readFile(path.join(cityRoot, "city.json"), "utf-8");
    metadata = JSON.parse(raw);
  } catch {
    // City descriptor optional or generated later
  }

  try {
    const raw = await fs.readFile(path.join(cityRoot, "workspace.json"), "utf-8");
    workspace = JSON.parse(raw);
  } catch {
    // Workspace layout optional
  }

  const listDirFiles = async (sub: string) => {
    try {
      const dirPath = path.join(cityRoot, sub);
      const entries = await fs.readdir(dirPath);
      return entries.filter((e) => !e.startsWith("."));
    } catch {
      return [];
    }
  };

  const [notes, sources, tabs] = await Promise.all([
    listDirFiles("notes"),
    listDirFiles("sources"),
    listDirFiles("tabs"),
  ]);

  return {
    cityId,
    metadata,
    workspace,
    notes,
    sources,
    tabs,
  };
}

/**
 * Safely reads a file from the city workspace.
 */
export async function readCityFile(cityId: string, relativePath: string): Promise<string> {
  const safePath = await resolveSafeCityPath(cityId, relativePath);
  return await fs.readFile(safePath, "utf-8");
}

/**
 * Safely writes a file to the city workspace.
 */
export async function writeCityFile(
  cityId: string,
  relativePath: string,
  content: string
): Promise<string> {
  const safePath = await resolveSafeCityPath(cityId, relativePath);
  await fs.mkdir(path.dirname(safePath), { recursive: true });
  await fs.writeFile(safePath, content, "utf-8");
  return safePath;
}

/**
 * Safely deletes a file from the city workspace.
 */
export async function deleteCityFile(cityId: string, relativePath: string): Promise<void> {
  const safePath = await resolveSafeCityPath(cityId, relativePath);
  await fs.unlink(safePath);
}
