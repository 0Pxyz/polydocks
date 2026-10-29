import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { writeFeature, readFeature } from "./features";
import {
  ensurePluginFilesTable,
  getPluginFile,
  migrateWorkspacePluginFiles,
} from "./pluginFiles";
import { db } from "./db";

const WS = "test-plugin-db-source";
const PLUGIN = "test-db-plugin";

describe("Plugin code in SQLite (single source of truth)", () => {
  beforeAll(() => {
    ensurePluginFilesTable();
    db.query("DELETE FROM plugin_files WHERE workspace_id = ?").run(WS);
  });

  afterAll(async () => {
    db.query("DELETE FROM plugin_files WHERE workspace_id = ?").run(WS);
    await fs.rm(path.resolve(process.cwd(), "workspace", WS), { recursive: true, force: true }).catch(() => {});
  });

  it("write/read round trip via DB with no filesystem files", async () => {
    await writeFeature(WS, PLUGIN, {
      manifest: { id: PLUGIN, title: "DB Plugin" },
      code: `const app = document.getElementById('app'); if (app) app.textContent = 'hi';`,
    });

    // No filesystem mirror may exist (production redeploy loses workspace/).
    const cityRoot = path.resolve(process.cwd(), "workspace", WS);
    const mirrored = await fs
      .readFile(path.join(cityRoot, "features", PLUGIN, "index.html"), "utf-8")
      .catch(() => null);
    expect(mirrored).toBeNull();

    const feat = await readFeature(WS, PLUGIN);
    expect(feat.manifest.title).toBe("DB Plugin");
    expect(feat.srcdoc).toContain("hi");
    expect(feat.code).toContain("getElementById");

    // DB row exists.
    const row = getPluginFile(PLUGIN, WS);
    expect(row).not.toBeNull();
    expect(row?.srcdoc.length).toBeGreaterThan(0);
  });

  it("missing-files case no longer possible: DB survives FS loss", async () => {
    // Simulate redeploy wiping workspace/ but keeping ./data (SQLite).
    await fs.rm(path.resolve(process.cwd(), "workspace", WS), { recursive: true, force: true }).catch(() => {});
    const feat = await readFeature(WS, PLUGIN);
    expect(feat.srcdoc.length).toBeGreaterThan(0);
  });

  it("migration imports workspace files idempotently and prefers newest", async () => {
    const migWs = `${WS}-migrate`;
    const root = path.resolve(process.cwd(), "workspace", migWs);
    await fs.mkdir(path.join(root, "features", "mig-plug"), { recursive: true });
    await fs.mkdir(path.join(root, "tabs", "mig-plug"), { recursive: true });
    await fs.writeFile(
      path.join(root, "features", "mig-plug", "manifest.json"),
      JSON.stringify({ id: "mig-plug", title: "New", updatedAt: "2026-10-02T00:00:00.000Z" })
    );
    await fs.writeFile(path.join(root, "features", "mig-plug", "index.html"), "<html>new</html>");
    await fs.writeFile(
      path.join(root, "tabs", "mig-plug", "manifest.json"),
      JSON.stringify({ id: "mig-plug", title: "Old", updatedAt: "2026-09-01T00:00:00.000Z" })
    );
    await fs.writeFile(path.join(root, "tabs", "mig-plug", "index.html"), "<html>old</html>");

    const first = await migrateWorkspacePluginFiles(path.resolve(process.cwd(), "workspace"));
    expect(first.imported).toBeGreaterThanOrEqual(1);
    const row = getPluginFile("mig-plug", migWs);
    expect(row?.manifest.title).toBe("New");
    expect(first.conflicts.some((c) => c.pluginId === "mig-plug")).toBe(true);

    const second = await migrateWorkspacePluginFiles(path.resolve(process.cwd(), "workspace"));
    const still = getPluginFile("mig-plug", migWs);
    expect(still?.manifest.title).toBe("New");
    expect(second.imported).toBeLessThanOrEqual(first.imported);

    db.query("DELETE FROM plugin_files WHERE workspace_id = ?").run(migWs);
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  });
});
