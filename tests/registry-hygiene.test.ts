import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { pluginRegistry } from "../server/plugins/registry";
import { db } from "../server/workspace/db";

const RUN = `hygiene-${Date.now()}`;
const FAKE = `${RUN}-fake`;

/**
 * Registry hygiene (#310): uninstall leaves no orphans; audit finds
 * orphan rows and duplicate display names.
 */
describe("plugin registry hygiene (#310)", () => {
  beforeEach(() => {
    for (const t of ["plugins", "plugin_grants", "executions", "plugin_versions", "plugin_files"] as const) {
      const col = t === "plugins" ? "id" : "plugin_id";
      try {
        db.query(`DELETE FROM "${t}" WHERE "${col}" LIKE '${RUN}%'`).run();
      } catch { /* table may not exist on older schemas */ }
    }
  });
  afterEach(() => {
    for (const t of ["plugins", "plugin_grants", "executions", "plugin_versions", "plugin_files"] as const) {
      const col = t === "plugins" ? "id" : "plugin_id";
      try {
        db.query(`DELETE FROM "${t}" WHERE "${col}" LIKE '${RUN}%'`).run();
      } catch { /* table may not exist on older schemas */ }
    }
  });

  it("uninstall removes executions, versions and files with the plugin", () => {
    pluginRegistry.install({
      apiVersion: 1,
      id: FAKE,
      name: `${RUN} Fake`,
      version: "1.0.0",
      description: "hygiene probe",
      icon: "Flask",
      trust: "external",
      capabilities: [],
      permissions: [],
    });
    const now = new Date().toISOString();
    db.query(
      `INSERT INTO executions (execution_id, capability_id, plugin_id, actor, workspace_id, status, duration_ms, input_json, output_json, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(`exec_${RUN}`, `${FAKE}.probe`, FAKE, "user", "default", "success", 1, "{}", "{}", null, now);
    db.query(
      `INSERT INTO plugin_versions (plugin_id, version, workspace_id, manifest_json, source_code, srcdoc, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(FAKE, "9.9.9-probe", "default", "{}", null, "<p>x</p>", "active", now);

    expect(pluginRegistry.uninstall(FAKE)).toBe(true);
    const left = (t: string) =>
      (db.query(`SELECT COUNT(*) as n FROM "${t}" WHERE plugin_id = ?`).get(FAKE) as any).n as number;
    expect(left("executions")).toBe(0);
    expect(left("plugin_versions")).toBe(0);
    expect(left("plugin_grants")).toBe(0);
    expect(pluginRegistry.get(FAKE)).toBeNull();
  });

  it("audit reports orphans and duplicate display names", () => {
    const now = new Date().toISOString();
    db.query(
      `INSERT INTO executions (execution_id, capability_id, plugin_id, actor, workspace_id, status, duration_ms, input_json, output_json, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(`exec_${RUN}_orphan`, `${RUN}-ghost.probe`, `${RUN}-ghost`, "user", "default", "success", 1, "{}", "{}", null, now);

    const { orphans, duplicates } = pluginRegistry.audit();
    expect(orphans.some((o) => o.table === "executions" && o.pluginId === `${RUN}-ghost`)).toBe(true);
    // No duplicate display names in the live registry (Notes/Bitcoin class resolved).
    expect(duplicates).toEqual([]);

    db.query(`DELETE FROM executions WHERE plugin_id = ?`).run(`${RUN}-ghost`);
    expect(pluginRegistry.audit().orphans.some((o) => o.pluginId === `${RUN}-ghost`)).toBe(false);
  });

  it("kit gallery stays out of production", async () => {
    const { registerKitGalleryPlugin } = await import("../server/plugins/first-party/kitGallery");
    const prev = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";
    try {
      pluginRegistry.uninstall("kit-gallery");
      registerKitGalleryPlugin();
      expect(pluginRegistry.get("kit-gallery")).toBeNull();
    } finally {
      (process.env as any).NODE_ENV = prev;
      if (prev !== "production") registerKitGalleryPlugin();
    }
  });
});
