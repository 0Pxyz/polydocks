import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { db } from "../workspace/db";
import { defineCapability } from "./contract";
import { readCityFile, writeCityFile } from "../workspace/cityWorkspace";

/**
 * Cities first-party plugin (contract-based).
 *
 * City lifecycle through one contract: cities.create (registers the row),
 * cities.enter (verified entry), quests.add and notes.write (content with
 * the same envelope everywhere). The agent never invents city state by
 * hand; every mutation returns an id the UI can verify.
 */

export function registerCitiesPlugin(): void {
  defineCapability({
    plugin: "cities",
    name: "create",
    title: "Create City",
    description: "Registers a city workspace: writes the cities row and validates it by re-reading. Files alone never constitute a city.",
    scope: "global",
    input: z.object({
      cityId: z.string().min(1).describe("Workspace folder id (slug, e.g. 'biohacking')"),
      title: z.string().min(1).describe("Human-readable city title"),
      region: z.string().optional().describe("Region label (defaults to Core Region)"),
    }),
    output: z.object({
      id: z.string(),
      title: z.string(),
      region: z.string(),
    }),
    emits: ["city.created"],
    risk: "write",
    handler: async (input) => {
      db.query(
        "INSERT OR REPLACE INTO cities (id, title, region, level, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(input.cityId, input.title, input.region || "Core Region", 1, "[]", Math.floor(Date.now() / 1000));
      const row = db.query("SELECT id, title, region FROM cities WHERE id = ?").get(input.cityId) as any;
      if (!row) {
        return { ok: false as const, error: `City "${input.cityId}" was written but could not be read back.`, retryable: true as const };
      }
      return { ok: true as const, id: row.id, data: { id: row.id, title: row.title, region: row.region } };
    },
  });

  defineCapability({
    plugin: "cities",
    name: "enter",
    title: "Enter City",
    description: "Verified entry into a city workspace for showing its content. Fails when the city does not exist.",
    scope: "global",
    input: z.object({
      cityId: z.string().min(1).describe("Workspace folder id"),
    }),
    output: z.object({ cityId: z.string(), entered: z.boolean() }),
    emits: ["city.enter"],
    risk: "read",
    handler: async (input) => {
      // Reuse the verified agent tool so both surfaces share one check.
      const { enter_city } = await import("../agent/tools/enter_city");
      const res = (await enter_city.execute({ cityId: input.cityId }, { step: 1 })) as any;
      if (res?.error) {
        return { ok: false as const, error: res.error, retryable: res.retryable !== false };
      }
      return { ok: true as const, id: input.cityId, data: { cityId: input.cityId, entered: true } };
    },
  });

  defineCapability({
    plugin: "cities",
    name: "quest_add",
    title: "Add Quest",
    description: "Appends a quest to the city's quests/tree.json (creates the file when missing).",
    scope: "city",
    input: z.object({
      cityId: z.string().min(1),
      title: z.string().min(1).describe("Quest title"),
      description: z.string().default("").describe("Quest briefing"),
      xpReward: z.number().int().min(0).default(50),
    }),
    output: z.object({ id: z.string(), cityId: z.string(), title: z.string() }),
    emits: ["quest.added"],
    risk: "write",
    handler: async (input) => {
      let quests: any[] = [];
      try {
        const raw = await readCityFile(input.cityId, "quests/tree.json");
        const parsed = JSON.parse(raw);
        quests = Array.isArray(parsed) ? parsed : [];
      } catch {
        quests = [];
      }
      const id = `quest-${input.cityId}-${Date.now().toString(36)}`;
      quests.push({ id, title: input.title, description: input.description, xpReward: input.xpReward, completed: false });
      await writeCityFile(input.cityId, "quests/tree.json", JSON.stringify(quests, null, 2));
      return { ok: true as const, id, data: { id, cityId: input.cityId, title: input.title } };
    },
  });

  defineCapability({
    plugin: "cities",
    name: "note_write",
    title: "Write Note",
    description: "Writes a markdown note into the city workspace (notes/<path>).",
    scope: "city",
    input: z.object({
      cityId: z.string().min(1),
      path: z.string().min(1).describe("Relative path under notes/ (e.g. 'study-guide.md')"),
      content: z.string().min(1).describe("Markdown content"),
    }),
    output: z.object({ cityId: z.string(), path: z.string() }),
    emits: ["note.written"],
    risk: "write",
    handler: async (input) => {
      const rel = input.path.startsWith("notes/") ? input.path : `notes/${input.path}`;
      await writeCityFile(input.cityId, rel, input.content);
      return { ok: true as const, id: `${input.cityId}:${rel}`, data: { cityId: input.cityId, path: rel } };
    },
  });
}

/** Workspace folder check shared by city-scoped reads. */
export function cityWorkspaceExists(cityId: string): boolean {
  try {
    return fs.statSync(path.resolve(process.cwd(), "workspace", cityId)).isDirectory();
  } catch {
    return false;
  }
}
