import { PluginRegistry, type InstalledPluginRecord } from "../plugins/registry";
import type { PluginManifest } from "../plugins/manifest";
import { writeFeature, readFeature } from "../workspace/features";
import { getPluginFile } from "../workspace/pluginFiles";
import { saveVersion, rollbackPlugin } from "../plugins/versions";
import { addPluginToWorkspace } from "../workspace/workspaces";
import { publishToRegistry, type RegistryPluginRecord } from "../plugins/communityRegistry";
import { db } from "../workspace/db";
import { recordAudit, type AuditActor } from "./audit";
import { withIdempotency } from "./idempotency";

export interface SynthesizePluginInput {
  id: string;
  name: string;
  description: string;
  icon?: string;
  code: string;
  workspaceId?: string;
  capabilities?: Array<{
    id: string;
    title: string;
    description: string;
    risk?: "read" | "write" | "destructive" | "external";
    input?: Record<string, unknown>;
  }>;
  actor?: AuditActor;
  idempotencyKey?: string;
}

export interface ModifyPluginInput {
  id: string;
  code: string;
  changeSummary: string;
  name?: string;
  description?: string;
  icon?: string;
  workspaceId?: string;
  actor?: AuditActor;
}

export interface PublishPluginInput {
  pluginId: string;
  workspaceId?: string;
  author?: string;
  tags?: string[];
  actor?: AuditActor;
  idempotencyKey?: string;
}

function bumpPatchVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length >= 3) {
    const patch = parseInt(parts[2], 10);
    if (!Number.isNaN(patch)) {
      return `${parts[0]}.${parts[1]}.${patch + 1}`;
    }
  }
  return `${version}.1`;
}

export class PluginService {
  public static listPlugins(options?: { enabledOnly?: boolean }): InstalledPluginRecord[] {
    const registry = PluginRegistry.getInstance();
    return registry.list(options);
  }

  public static getPlugin(pluginId: string): InstalledPluginRecord | null {
    const registry = PluginRegistry.getInstance();
    return registry.get(pluginId);
  }

  public static async installPlugin(
    rawManifest: unknown,
    actor: AuditActor = "user",
    idempotencyKey?: string
  ): Promise<{ success: boolean; plugin?: InstalledPluginRecord; error?: string }> {
    const manifestId = (rawManifest as any)?.id || "unknown";

    return await withIdempotency(
      idempotencyKey,
      "plugin.install",
      manifestId,
      async () => {
        const registry = PluginRegistry.getInstance();
        const result = registry.install(rawManifest);

        if (result.success && result.plugin) {
          recordAudit({
            actor,
            action: "plugin.install",
            targetId: result.plugin.id,
            details: { name: result.plugin.name, version: result.plugin.version },
          });
        }

        return result;
      }
    );
  }

  public static uninstallPlugin(
    pluginId: string,
    actor: AuditActor = "user"
  ): { success: boolean; error?: string } {
    const registry = PluginRegistry.getInstance();
    const existing = registry.get(pluginId);
    if (!existing) {
      return { success: false, error: `Plugin "${pluginId}" not found.` };
    }

    try {
      db.prepare("DELETE FROM plugin_grants WHERE plugin_id = ?").run(pluginId);
      db.prepare("DELETE FROM workspace_plugins WHERE plugin_id = ?").run(pluginId);
      db.prepare("DELETE FROM plugins WHERE id = ?").run(pluginId);

      recordAudit({
        actor,
        action: "plugin.uninstall",
        targetId: pluginId,
        details: { name: existing.name },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to uninstall plugin" };
    }
  }

  public static configurePlugin(
    pluginId: string,
    settings: Record<string, unknown>,
    workspaceId: string = "default",
    actor: AuditActor = "user"
  ): { success: boolean; error?: string } {
    try {
      const serialized = JSON.stringify(settings);
      db.prepare(`
        UPDATE workspace_plugins
        SET settings_json = ?
        WHERE workspace_id = ? AND plugin_id = ?
      `).run(serialized, workspaceId, pluginId);

      recordAudit({
        actor,
        action: "plugin.configure",
        targetId: `${workspaceId}:${pluginId}`,
        details: { workspaceId, pluginId, settings },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to configure plugin" };
    }
  }

  public static async synthesizePlugin(
    input: SynthesizePluginInput
  ): Promise<{
    success: boolean;
    pluginId?: string;
    name?: string;
    workspaceId?: string;
    version?: string;
    action?: string;
    message?: string;
    error?: string;
    mounted?: unknown;
  }> {
    const workspaceId = input.workspaceId || "default";
    const pluginId = input.id.toLowerCase().trim();
    const icon = input.icon || "Cards";

    return await withIdempotency(
      input.idempotencyKey,
      "plugin.synthesize",
      pluginId,
      async () => {
        const featureManifest = {
          id: pluginId,
          title: input.name,
          icon,
          scope: "workspace",
          workspaceId,
          capabilities: input.capabilities?.map((c) => c.id) || [],
          createdAt: new Date().toISOString(),
        };

        // 1. Transpile and write feature module
        await writeFeature(workspaceId, pluginId, {
          manifest: featureManifest,
          code: input.code,
        });

        // 2. Build and register PluginManifest
        const manifestCapabilities = (input.capabilities || []).map((cap) => ({
          id: cap.id.includes(".") ? cap.id : `${pluginId}.${cap.id}`,
          title: cap.title,
          description: cap.description,
          risk: cap.risk || "read",
          input: cap.input || { type: "object" },
        }));

        const pluginManifest: PluginManifest = {
          apiVersion: 1,
          id: pluginId,
          name: input.name,
          version: "1.0.0",
          description: input.description,
          icon,
          trust: "generated",
          capabilities: manifestCapabilities,
          surfaces: [
            {
              id: pluginId,
              title: input.name,
              icon,
              variant: "immersive",
              entry: `features/${pluginId}`,
            },
          ],
          permissions: [],
        };

        const registry = PluginRegistry.getInstance();
        // Draft -> validate -> activate: transpile first (throws on invalid
        // code, leaving the live version untouched), then register.
        let installResult;
        try {
          installResult = registry.install(pluginManifest);
        } catch (err: any) {
          return {
            success: false,
            error: err?.message || "Failed to register plugin manifest",
          };
        }
        if (!installResult.success) {
          return {
            success: false,
            error: installResult.error || "Failed to register plugin manifest",
          };
        }

        // Record the activated version with code snapshot (history kept).
        try {
          const stored = getPluginFile(pluginId, workspaceId);
          saveVersion({
            pluginId,
            version: "1.0.0",
            workspaceId,
            manifestJson: JSON.stringify(pluginManifest),
            sourceCode: stored?.code ?? input.code,
            srcdoc: stored?.srcdoc ?? "",
            status: "active",
          });
        } catch {
          // Non-fatal: registry row is already live.
        }

        // 3. Mount into workspace dock
        const mounted = addPluginToWorkspace(workspaceId, pluginId);

        recordAudit({
          actor: input.actor || "user",
          action: "plugin.synthesize",
          targetId: pluginId,
          details: { name: input.name, workspaceId, version: "1.0.0" },
        });

        return {
          success: true,
          pluginId,
          name: input.name,
          workspaceId,
          version: "1.0.0",
          action: "dock.tool_mounted",
          message: `Plugin "${input.name}" successfully synthesized and mounted to workspace "${workspaceId}".`,
          mounted,
        };
      }
    );
  }

  public static async modifyPlugin(
    input: ModifyPluginInput
  ): Promise<{
    success: boolean;
    pluginId?: string;
    name?: string;
    workspaceId?: string;
    version?: string;
    action?: string;
    changeSummary?: string;
    message?: string;
    error?: string;
  }> {
    const workspaceId = input.workspaceId || "default";
    const pluginId = input.id.toLowerCase().trim();

    const registry = PluginRegistry.getInstance();
    const existingPlugin = registry.get(pluginId);
    const existingFeature = await readFeature(workspaceId, pluginId);

    if (!existingPlugin && !existingFeature) {
      return {
        success: false,
        error: `Plugin "${pluginId}" not found in workspace "${workspaceId}". Use create_plugin to create a new tool.`,
      };
    }

    const currentVersion = existingPlugin?.version || "1.0.0";
    const nextVersion = bumpPatchVersion(currentVersion);
    const name = input.name || existingPlugin?.name || existingFeature?.manifest.title || pluginId;
    const description = input.description || existingPlugin?.manifest.description || "";
    const icon = input.icon || existingPlugin?.manifest.icon || existingFeature?.manifest.icon || "Cards";

    const updatedFeatureManifest = {
      ...(existingFeature?.manifest || { id: pluginId, scope: "workspace", workspaceId }),
      title: name,
      icon,
      version: nextVersion,
      updatedAt: new Date().toISOString(),
    };

    // 1. Write updated feature module (transpile validates; throws before
    // touching the registry so the live version stays intact on bad code).
    await writeFeature(workspaceId, pluginId, {
      manifest: updatedFeatureManifest,
      code: input.code,
    });

    // 2. Update PluginManifest (transactional versioned write inside install;
    // on failure the previous live version stays active).
    const updatedPluginManifest: PluginManifest = {
      ...(existingPlugin?.manifest || {
        apiVersion: 1,
        id: pluginId,
        trust: "generated",
        capabilities: [],
        permissions: [],
      }),
      apiVersion: 1,
      id: pluginId,
      name,
      version: nextVersion,
      description,
      icon,
      surfaces: [
        {
          id: pluginId,
          title: name,
          icon,
          variant: "immersive",
          entry: `features/${pluginId}`,
        },
      ],
    };

    let installResult;
    try {
      installResult = registry.install(updatedPluginManifest);
    } catch (err: any) {
      // Keep the previous version live; roll back the registry pointer.
      rollbackPlugin(pluginId, currentVersion);
      return {
        success: false,
        error: err?.message || "Failed to update plugin manifest in registry",
      };
    }
    if (!installResult.success) {
      rollbackPlugin(pluginId, currentVersion);
      return {
        success: false,
        error: installResult.error || "Failed to update plugin manifest in registry",
      };
    }

    try {
      const stored = getPluginFile(pluginId, workspaceId);
      saveVersion({
        pluginId,
        version: nextVersion,
        workspaceId,
        manifestJson: JSON.stringify(updatedPluginManifest),
        sourceCode: stored?.code ?? input.code,
        srcdoc: stored?.srcdoc ?? "",
        status: "active",
      });
    } catch {
      // Non-fatal
    }

    recordAudit({
      actor: input.actor || "user",
      action: "plugin.modify",
      targetId: pluginId,
      details: { name, version: nextVersion, changeSummary: input.changeSummary },
    });

    return {
      success: true,
      pluginId,
      name,
      workspaceId,
      version: nextVersion,
      action: "dock.tool_updated",
      changeSummary: input.changeSummary,
      message: `Plugin "${name}" updated to v${nextVersion}. Changes applied: ${input.changeSummary}`,
    };
  }

  public static async publishPlugin(
    input: PublishPluginInput
  ): Promise<{
    success: boolean;
    pluginId?: string;
    item?: RegistryPluginRecord;
    message?: string;
    error?: string;
  }> {
    const workspaceId = input.workspaceId || "default";

    return await withIdempotency(
      input.idempotencyKey,
      "plugin.publish",
      input.pluginId,
      async () => {
        const res = await publishToRegistry({
          pluginId: input.pluginId,
          workspaceId,
          author: input.author || "PolyDocks User",
          tags: input.tags || ["community", "tool"],
        });

        if (!res.success) {
          return {
            success: false,
            error: res.error || `Failed to publish plugin "${input.pluginId}"`,
          };
        }

        recordAudit({
          actor: input.actor || "user",
          action: "plugin.publish",
          targetId: input.pluginId,
          details: { name: res.item?.name, author: input.author, tags: input.tags },
        });

        return {
          success: true,
          pluginId: input.pluginId,
          item: res.item,
          message: `Plugin "${res.item?.name}" has been published to the Community Plugin Store.`,
        };
      }
    );
  }
}
