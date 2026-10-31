import { describe, it, expect, beforeEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  type PluginManifest,
  validatePluginManifest,
} from "../server/plugins/manifest";
import { PluginRegistry } from "../server/plugins/registry";
import { db } from "../server/workspace/db";

describe("Plugin Architecture & Manifest Registry (Core)", () => {
  const registry = PluginRegistry.getInstance();

  const validManifest: PluginManifest = {
    apiVersion: 1,
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    description: "A test plugin for capability testing",
    icon: "Sparkle",
    trust: "first-party",
    capabilities: [
      {
        id: "test-plugin.ping",
        title: "Ping Action",
        description: "Returns a pong response",
        input: { type: "object", properties: { message: { type: "string" } } },
        risk: "read",
      },
    ],
    surfaces: [
      {
        id: "test-surface",
        title: "Test Surface",
        icon: "Sparkle",
        variant: "immersive",
        entry: "TestView",
      },
    ],
    permissions: [
      {
        type: "net",
        hosts: ["api.example.com"],
      },
      {
        type: "fs",
        scope: "workspace",
        mode: "read",
      },
    ],
  };

  beforeEach(() => {
    // Clean up test records
    db.query("DELETE FROM plugins WHERE id LIKE 'test-%'").run();
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'test-%'").run();
  });

  describe("Manifest Validation Contract", () => {
    it("validates compliant apiVersion: 1 manifest successfully", () => {
      const res = validatePluginManifest(validManifest);
      expect(res.success).toBe(true);
      expect(res.data?.id).toBe("test-plugin");
      expect(res.data?.apiVersion).toBe(1);
    });

    it("strictly rejects manifests with non-v1 apiVersion", () => {
      const invalid = { ...validManifest, apiVersion: 2 };
      const res = validatePluginManifest(invalid);
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it("rejects uppercase or invalid characters in plugin id", () => {
      const invalid = { ...validManifest, id: "Invalid_ID!" };
      const res = validatePluginManifest(invalid);
      expect(res.success).toBe(false);
    });

    it("strictly enforces semver versioning format", () => {
      const invalid = { ...validManifest, version: "v1" };
      const res = validatePluginManifest(invalid);
      expect(res.success).toBe(false);
    });

    it("validates permission schemas and rejects invalid permission types", () => {
      const invalid = {
        ...validManifest,
        permissions: [{ type: "root", commands: ["all"] }],
      };
      const res = validatePluginManifest(invalid);
      expect(res.success).toBe(false);
    });
  });

  describe("Plugin Registry Lifecycle & SQLite Persistence", () => {
    it("installs, retrieves, and lists plugin records in SQLite", () => {
      const installRes = registry.install(validManifest);
      expect(installRes.success).toBe(true);
      expect(installRes.plugin?.id).toBe("test-plugin");
      expect(installRes.plugin?.enabled).toBe(true);

      const fetched = registry.get("test-plugin");
      expect(fetched).not.toBeNull();
      expect(fetched?.name).toBe("Test Plugin");
      expect(fetched?.manifest.capabilities.length).toBe(1);

      const list = registry.list();
      expect(list.some((p) => p.id === "test-plugin")).toBe(true);
    });

    it("enables and disables plugins dynamically", () => {
      registry.install(validManifest);
      expect(registry.get("test-plugin")?.enabled).toBe(true);

      registry.disable("test-plugin");
      expect(registry.get("test-plugin")?.enabled).toBe(false);

      const enabledOnly = registry.list({ enabledOnly: true });
      expect(enabledOnly.some((p) => p.id === "test-plugin")).toBe(false);

      registry.enable("test-plugin");
      expect(registry.get("test-plugin")?.enabled).toBe(true);
    });

    it("records, retrieves, and checks permission grants", () => {
      registry.install(validManifest);

      registry.recordGrant(
        "test-plugin",
        "net",
        "api.example.com",
        "allow_always"
      );

      expect(
        registry.hasGrant("test-plugin", "net", "api.example.com")
      ).toBe(true);
      expect(
        registry.hasGrant("test-plugin", "net", "other.example.com")
      ).toBe(false);

      const grants = registry.getGrants("test-plugin");
      expect(grants.length).toBe(1);
      expect(grants[0].scope).toBe("api.example.com");

      // Revoke grant
      registry.revokeGrant(grants[0].grantId);
      expect(
        registry.hasGrant("test-plugin", "net", "api.example.com")
      ).toBe(false);
    });

    it("uninstalls plugin and purges associated grants cleanly", () => {
      registry.install(validManifest);
      registry.recordGrant("test-plugin", "net", "api.example.com", "allow_always");

      expect(registry.has("test-plugin")).toBe(true);
      const uninstalled = registry.uninstall("test-plugin");
      expect(uninstalled).toBe(true);

      expect(registry.has("test-plugin")).toBe(false);
      expect(registry.getGrants("test-plugin").length).toBe(0);
    });

    it("discovers manifests from a directory on the filesystem", () => {
      const tempDir = path.join(import.meta.dir, ".temp_plugins_test");
      const pluginDir = path.join(tempDir, "test-discovered");
      fs.mkdirSync(pluginDir, { recursive: true });

      const discoveredManifest: PluginManifest = {
        ...validManifest,
        id: "test-discovered",
        name: "Discovered Plugin",
      };

      fs.writeFileSync(
        path.join(pluginDir, "plugin.json"),
        JSON.stringify(discoveredManifest, null, 2)
      );

      try {
        const res = registry.discoverFromDirectory(tempDir);
        expect(res.discovered).toBe(1);
        expect(registry.has("test-discovered")).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
        registry.uninstall("test-discovered");
      }
    });
  });
});
