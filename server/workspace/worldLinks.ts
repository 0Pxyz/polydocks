import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

export const WorldLinkSchema = z.object({
  from: z.string().min(1).describe("Origin city ID"),
  to: z.string().min(1).describe("Destination city ID"),
  reason: z.string().max(280).optional().describe("Why these cities relate"),
  createdAt: z.string().optional(),
});

export type WorldLink = z.infer<typeof WorldLinkSchema> & { createdAt: string };

const LINKS_FILE = "world-links.json";

function linksFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, LINKS_FILE);
}

export function defaultWorkspaceRoot(): string {
  return path.resolve(process.cwd(), "workspace");
}

async function readLinksFile(workspaceRoot: string): Promise<WorldLink[]> {
  try {
    const raw = await fs.readFile(linksFilePath(workspaceRoot), "utf-8");
    const parsed = JSON.parse(raw);
    const links = Array.isArray(parsed) ? parsed : parsed.links;
    if (!Array.isArray(links)) return [];
    return links.flatMap((l) => {
      const res = WorldLinkSchema.safeParse(l);
      return res.success
        ? [{ ...res.data, createdAt: res.data.createdAt || new Date().toISOString() }]
        : [];
    });
  } catch {
    return [];
  }
}

export async function getWorldLinks(workspaceRoot = defaultWorkspaceRoot()): Promise<WorldLink[]> {
  return readLinksFile(workspaceRoot);
}

export interface AddWorldLinkInput {
  from: string;
  to: string;
  reason?: string;
}

/**
 * Appends a conceptual connection between two cities. Validates IDs,
 * rejects self-links and exact duplicates. Atomic write via tmp + rename.
 */
export async function addWorldLink(
  input: AddWorldLinkInput,
  workspaceRoot = defaultWorkspaceRoot()
): Promise<{ success: boolean; link?: WorldLink; error?: string }> {
  const from = input.from.trim();
  const to = input.to.trim();
  if (!from || !to) {
    return { success: false, error: "Both from and to city IDs are required." };
  }
  if (from === to) {
    return { success: false, error: "A city cannot link to itself." };
  }

  const links = await readLinksFile(workspaceRoot);
  const pairKey = [from, to].sort().join("<->");
  const duplicate = links.some((l) => [l.from, l.to].sort().join("<->") === pairKey);
  if (duplicate) {
    return { success: false, error: `Cities "${from}" and "${to}" are already linked.` };
  }

  const link: WorldLink = {
    from,
    to,
    reason: input.reason?.slice(0, 280),
    createdAt: new Date().toISOString(),
  };
  const next = [...links, link];

  await fs.mkdir(workspaceRoot, { recursive: true });
  const tmp = `${linksFilePath(workspaceRoot)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ links: next }, null, 2), "utf-8");
  await fs.rename(tmp, linksFilePath(workspaceRoot));

  return { success: true, link };
}
