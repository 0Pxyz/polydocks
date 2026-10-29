import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "../workspace/db";
import { PluginRegistry } from "./registry";
import { listVersions, rollbackPlugin, ensurePluginVersionsTable } from "./versions";

const ID = "test-versioned-plugin";

describe("Versioned, transactional publish", () => {
  beforeAll(() => {
    ensurePluginVersionsTable();
    db.query("DELETE FROM plugins WHERE id = ?").run(ID);
    db.query("DELETE FROM plugin_versions WHERE plugin_id = ?").run(ID);
  });

  afterAll(() => {
    db.query("DELETE FROM plugins WHERE id = ?").run(ID);
    db.query("DELETE FROM plugin_versions WHERE plugin_id = ?").run(ID);
  });

  it("stores every version and keeps history instead of overwriting", () => {
    const registry = PluginRegistry.getInstance();
    const base = {
      apiVersion: 1,
      id: ID,
      name: "Versioned",
      description: "v test",
      icon: "Cards",
      trust: "generated",
      capabilities: [],
      surfaces: [],
      permissions: [],
    } as any;

    expect(registry.install({ ...base, version: "1.0.0" }).success).toBe(true);
    expect(registry.install({ ...base, version: "1.0.1" }).success).toBe(true);

    const history = listVersions(ID);
    const versions = history.map((v) => v.version);
    expect(versions).toContain("1.0.0");
    expect(versions).toContain("1.0.1");
    expect(registry.get(ID)?.version).toBe("1.0.1");
  });

  it("failed publish leaves the previous working version live", () => {
    const registry = PluginRegistry.getInstance();
    const before = registry.get(ID)?.version;
    // Invalid manifest (missing required fields) must fail validation.
    const bad = registry.install({ id: ID, name: "Bad" } as any);
    expect(bad.success).toBe(false);
    expect(registry.get(ID)?.version).toBe(before);
  });

  it("rollback restores the previous version internally", () => {
    const registry = PluginRegistry.getInstance();
    const res = rollbackPlugin(ID, "1.0.0");
    expect(res.success).toBe(true);
    expect(res.version).toBe("1.0.0");
    expect(registry.get(ID)?.version).toBe("1.0.0");
  });
});
