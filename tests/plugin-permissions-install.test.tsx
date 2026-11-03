import { describe, it, expect, beforeEach } from "bun:test";
import { renderToString } from "react-dom/server";
import {
  describePermission,
  isQuietPermission,
  requiresInstallAcknowledge,
} from "../server/plugins/risk";
import { ensureRegistrySchema } from "../server/plugins/communityRegistry";
import { create_plugin } from "../server/agent/tools/create_plugin";
import { publishToRegistry } from "../server/plugins/communityRegistry";
import { ensureDefaultWorkspace, createWorkspace } from "../server/workspace/workspaces";
import { db } from "../server/workspace/db";
import { InstallConfirmSheet } from "../src/features/plugins/PluginStoreView";

/**
 * Risk-based install permissions (#180). The quiet/loud gate lives in
 * one place (risk.ts); routes expose the envelope; the store sheet gates
 * loud installs; enforcement itself is untouched.
 */
describe("install permission gate (#180)", () => {
  beforeEach(() => {
    ensureDefaultWorkspace();
    ensureRegistrySchema();
    db.query("DELETE FROM registry_plugins WHERE id LIKE 'test-%'").run();
  });

  it("treats own storage and reads as quiet, everything else as loud", () => {
    expect(requiresInstallAcknowledge([])).toBe(false);
    expect(isQuietPermission({ type: "fs", scope: "plugin", mode: "write" })).toBe(true);
    expect(isQuietPermission({ type: "fs", scope: "workspace", mode: "read" })).toBe(true);
    expect(requiresInstallAcknowledge([{ type: "fs", scope: "plugin", mode: "write" }])).toBe(false);
    expect(requiresInstallAcknowledge([{ type: "fs", scope: "workspace", mode: "write" }])).toBe(true);
    expect(requiresInstallAcknowledge([{ type: "net", hosts: ["example.com"] }])).toBe(true);
    expect(requiresInstallAcknowledge([{ type: "exec", commands: ["ls"] }])).toBe(true);
    expect(requiresInstallAcknowledge([{ type: "mcp", server: "x" }])).toBe(true);
    expect(requiresInstallAcknowledge([{ type: "secret", name: "TOKEN" }])).toBe(true);
  });

  it("describes every permission type as what + why", () => {
    expect(describePermission({ type: "net", hosts: ["example.com"] })).toContain("example.com");
    expect(describePermission({ type: "secret", name: "TOKEN" })).toContain("TOKEN");
    expect(describePermission({ type: "fs", scope: "plugin", mode: "write" })).toContain("plugin");
  });

  it("serves permission envelopes on registry cards and install", async () => {
    const { default: app } = await import("../server/index");
    await create_plugin.execute(
      {
        id: "test-perm-probe",
        name: "Perm Probe",
        description: "Permission envelope probe",
        code: "const app = document.getElementById('app');",
        workspaceId: "default",
      },
      { workspaceId: "default" }
    );
    await publishToRegistry({ pluginId: "test-perm-probe", workspaceId: "default", author: "Tester", tags: ["test"] });
    // Loud fixture: grant network access in the stored manifest.
    const row = db.query<any, []>("SELECT manifest_json FROM registry_plugins WHERE id = 'test-perm-probe'").get();
    const manifest = JSON.parse(row.manifest_json);
    manifest.permissions = [{ type: "net", hosts: ["api.example.com"] }];
    db.query("UPDATE registry_plugins SET manifest_json = ? WHERE id = 'test-perm-probe'").run(JSON.stringify(manifest));

    const getRes = await app.fetch(new Request("http://localhost:3000/api/registry?search=test-perm-probe"));
    expect(getRes.status).toBe(200);
    const cards = (await getRes.json()).data;
    expect(cards.length).toBe(1);
    expect(cards[0].requiresAcknowledge).toBe(true);
    expect(cards[0].permissionLines).toEqual([describePermission({ type: "net", hosts: ["api.example.com"] })]);

    try {
      createWorkspace({ id: "test-perm-ws", name: "Perm WS" });
    } catch {
      // Exists from a previous run.
    }
    const installRes = await app.fetch(
      new Request("http://localhost:3000/api/registry/test-perm-probe/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "test-perm-ws" }),
      })
    );
    expect(installRes.status).toBe(200);
    const installed = await installRes.json();
    expect(installed.success).toBe(true);
    expect(installed.requiresAcknowledge).toBe(true);
    expect(installed.permissionLines.length).toBe(1);
    expect(installed.permissionLines[0]).toContain("api.example.com");

    db.query("DELETE FROM registry_plugins WHERE id = 'test-perm-probe'").run();
    db.query("DELETE FROM workspace_plugins WHERE workspace_id = 'test-perm-ws'").run();
    db.query("DELETE FROM workspaces WHERE id = 'test-perm-ws'").run();
  });
});

describe("install confirm sheet (#180)", () => {
  it("renders what + why lines with Install gated behind acknowledge", () => {
    const html = renderToString(
      <InstallConfirmSheet
        pluginName="Loud Plugin"
        permissionLines={['Network access to api.example.com — the plugin fetches remote data.']}
        installing={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(html).toContain("Loud Plugin");
    expect(html).toContain("api.example.com");
    expect(html).toContain("I understand these permissions");
    // Unchecked by default: the Install button renders disabled.
    expect(html).toContain("disabled");
  });
});
