import { db } from "../workspace/db";
import { PluginRegistry } from "./registry";
import type { PluginManifest } from "./manifest";
import { readFeature, writeFeature } from "../workspace/features";
import { addPluginToWorkspace, ensureDefaultWorkspace } from "../workspace/workspaces";

export interface RegistryPluginItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  author: string;
  tags: string[];
  manifest: PluginManifest;
  code: string;
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

export function ensureRegistrySchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS registry_plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT DEFAULT 'Cards',
      version TEXT NOT NULL,
      author TEXT DEFAULT 'Community',
      tags_json TEXT,
      manifest_json TEXT NOT NULL,
      code TEXT NOT NULL,
      downloads INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

/**
 * Lists all plugins in the community registry.
 */
export function listRegistryPlugins(filter?: {
  search?: string;
  tag?: string;
}): RegistryPluginItem[] {
  ensureRegistrySchema();
  seedDefaultCommunityPlugins();

  let query = "SELECT * FROM registry_plugins";
  const conditions: string[] = [];
  const params: string[] = [];

  if (filter?.search) {
    conditions.push("(name LIKE ? OR description LIKE ? OR id LIKE ?)");
    const pattern = `%${filter.search}%`;
    params.push(pattern, pattern, pattern);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY downloads DESC, name ASC";

  const rows = db.query<any, string[]>(query).all(...params);

  return rows
    .map((r) => {
      let tags: string[] = [];
      let manifest: PluginManifest | null = null;
      try {
        if (r.tags_json) tags = JSON.parse(r.tags_json);
        if (r.manifest_json) manifest = JSON.parse(r.manifest_json);
      } catch {
        // ignore
      }
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        icon: r.icon || "Cards",
        version: r.version,
        author: r.author || "Community",
        tags,
        manifest: manifest || ({} as PluginManifest),
        code: r.code,
        downloads: r.downloads || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    })
    .filter((item) => {
      if (!filter?.tag) return true;
      return item.tags.some((t) => t.toLowerCase() === filter.tag?.toLowerCase());
    });
}

/**
 * Gets a registry plugin by ID.
 */
export function getRegistryPlugin(id: string): RegistryPluginItem | null {
  ensureRegistrySchema();
  const r = db.query<any, [string]>("SELECT * FROM registry_plugins WHERE id = ?").get(id);
  if (!r) return null;

  let tags: string[] = [];
  let manifest: PluginManifest = {} as PluginManifest;
  try {
    if (r.tags_json) tags = JSON.parse(r.tags_json);
    if (r.manifest_json) manifest = JSON.parse(r.manifest_json);
  } catch {
    // ignore
  }

  return {
    id: r.id,
    name: r.name,
    description: r.description,
    icon: r.icon || "Cards",
    version: r.version,
    author: r.author || "Community",
    tags,
    manifest,
    code: r.code,
    downloads: r.downloads || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Publishes an existing workspace plugin to the community registry.
 */
export async function publishToRegistry(input: {
  pluginId: string;
  workspaceId?: string;
  author?: string;
  tags?: string[];
}): Promise<{ success: boolean; item?: RegistryPluginItem; error?: string }> {
  ensureRegistrySchema();
  const workspaceId = input.workspaceId || "default";
  const pluginId = input.pluginId.toLowerCase().trim();

  const registry = PluginRegistry.getInstance();
  const existingPlugin = registry.get(pluginId);
  const existingFeature = await readFeature(workspaceId, pluginId);

  if (!existingPlugin && !existingFeature) {
    return {
      success: false,
      error: `Plugin "${pluginId}" not found in workspace "${workspaceId}"`,
    };
  }

  const name = existingPlugin?.name || existingFeature?.manifest.title || pluginId;
  const description =
    existingPlugin?.manifest.description ||
    existingFeature?.manifest.description ||
    "Custom synthesized plugin";
  const icon =
    existingPlugin?.manifest.icon || (existingFeature?.manifest.icon as string) || "Cards";
  const version = existingPlugin?.version || "1.0.0";
  const author = input.author?.trim() || "PolyDocks Creator";
  const tags = input.tags || ["productivity", "micro-app"];
  const code = existingFeature?.code || "";

  const manifest: PluginManifest = existingPlugin?.manifest || {
    apiVersion: 1,
    id: pluginId,
    name,
    version,
    description,
    icon,
    trust: "generated",
    capabilities: [],
    surfaces: [
      {
        id: pluginId,
        title: name,
        icon,
        variant: "immersive",
        entry: `features/${pluginId}`,
      },
    ],
    permissions: [],
  };

  const now = new Date().toISOString();

  db.query(`
    INSERT OR REPLACE INTO registry_plugins (id, name, description, icon, version, author, tags_json, manifest_json, code, downloads, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT downloads FROM registry_plugins WHERE id = ?), 0), ?, ?)
  `).run(
    pluginId,
    name,
    description,
    icon,
    version,
    author,
    JSON.stringify(tags),
    JSON.stringify(manifest),
    code,
    pluginId,
    now,
    now
  );

  return {
    success: true,
    item: {
      id: pluginId,
      name,
      description,
      icon,
      version,
      author,
      tags,
      manifest,
      code,
      downloads: 0,
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * Installs a plugin from the community registry into a target workspace.
 */
export async function installFromRegistry(
  registryPluginId: string,
  targetWorkspaceId: string
): Promise<{ success: boolean; error?: string; plugin?: PluginManifest }> {
  ensureDefaultWorkspace();
  const item = getRegistryPlugin(registryPluginId);
  if (!item) {
    return { success: false, error: `Registry plugin "${registryPluginId}" not found.` };
  }

  // 1. Write the code into the target workspace
  const featureManifest = {
    id: item.id,
    title: item.name,
    icon: item.icon,
    scope: "workspace",
    workspaceId: targetWorkspaceId,
    capabilities: item.manifest.capabilities?.map((c) => c.id) || [],
    createdAt: new Date().toISOString(),
  };

  await writeFeature(targetWorkspaceId, item.id, {
    manifest: featureManifest,
    code: item.code,
  });

  // 2. Install into local PluginRegistry
  const registry = PluginRegistry.getInstance();
  const installRes = registry.install(item.manifest);
  if (!installRes.success) {
    return { success: false, error: installRes.error || "Failed to install manifest" };
  }

  // 3. Mount in workspace
  addPluginToWorkspace(targetWorkspaceId, item.id);

  // 4. Increment download count
  db.query("UPDATE registry_plugins SET downloads = downloads + 1 WHERE id = ?").run(item.id);

  return { success: true, plugin: item.manifest };
}

/**
 * Seeds default canonical community plugins if none exist in the database.
 */
export function seedDefaultCommunityPlugins(): void {
  ensureRegistrySchema();
  const count = db.query<any, []>("SELECT COUNT(*) as count FROM registry_plugins").get()?.count || 0;

  const now = new Date().toISOString();

  // 1. Pomodoro Focus
  const pomodoroCode = `
    const app = document.getElementById('app');
    let timeLeft = 25 * 60;
    let timerId = null;
    let isRunning = false;
    let mode = 'work';
    let sessions = [];

    window.polymax.storage.get('pomodoro_sessions').then(saved => {
      if (Array.isArray(saved)) {
        sessions = saved;
        renderHistory();
      }
    });

    app.innerHTML = \`
      <div style="max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px;">
        <div style="display: flex; gap: 8px;">
          <button id="m-work" class="primary" style="padding: 6px 16px; border-radius: 20px;">Focus 25m</button>
          <button id="m-break" style="padding: 6px 16px; border-radius: 20px;">Break 5m</button>
        </div>
        <div id="disp" style="font-family: var(--font-mono); font-size: 64px; font-weight: 700; color: var(--accent); letter-spacing: -2px;">
          25:00
        </div>
        <div style="display: flex; gap: 12px;">
          <button id="toggle" class="primary" style="padding: 10px 24px; font-size: 15px;">Start session</button>
          <button id="reset" style="padding: 10px 18px;">Reset</button>
        </div>
        <div style="width: 100%; margin-top: 8px; padding-top: 8px;">
          <div style="font-size: 11px; color: var(--muted); margin-bottom: 8px;">Completed sessions: <span id="cnt">0</span></div>
          <div id="hist" style="display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto;"></div>
        </div>
      </div>
    \`;

    function updateDisp() {
      const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
      const s = (timeLeft % 60).toString().padStart(2, '0');
      document.getElementById('disp').innerText = \`\${m}:\${s}\`;
    }

    function setMode(next) {
      if (isRunning) return;
      mode = next;
      timeLeft = mode === 'work' ? 25 * 60 : 5 * 60;
      updateDisp();
      document.getElementById('m-work').className = mode === 'work' ? 'primary' : '';
      document.getElementById('m-break').className = mode === 'break' ? 'primary' : '';
      document.getElementById('toggle').innerText = 'Start session';
    }

    function renderHistory() {
      const list = document.getElementById('hist');
      const count = document.getElementById('cnt');
      if (!list || !count) return;
      count.innerText = sessions.length;
      list.innerHTML = sessions.slice(-5).reverse().map(s => \`
        <div style="display: flex; justify-content: space-between; font-size: 12px; padding: 8px 4px;">
          <span>\${s.mode === 'work' ? 'Focus' : 'Break'}</span>
          <span style="color: var(--muted); font-family: var(--font-mono);">\${new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      \`).join('');
    }

    document.getElementById('m-work').addEventListener('click', () => setMode('work'));
    document.getElementById('m-break').addEventListener('click', () => setMode('break'));
    document.getElementById('toggle').addEventListener('click', () => {
      isRunning = !isRunning;
      document.getElementById('toggle').innerText = isRunning ? 'Pause' : 'Resume';
      if (isRunning) {
        timerId = setInterval(() => {
          if (timeLeft > 0) {
            timeLeft--;
            updateDisp();
          } else {
            clearInterval(timerId);
            isRunning = false;
            sessions.push({ mode, timestamp: Date.now() });
            window.polymax.storage.set('pomodoro_sessions', sessions);
            renderHistory();
          }
        }, 1000);
      } else {
        clearInterval(timerId);
      }
    });

    document.getElementById('reset').addEventListener('click', () => {
      clearInterval(timerId);
      isRunning = false;
      timeLeft = mode === 'work' ? 25 * 60 : 5 * 60;
      updateDisp();
      document.getElementById('toggle').innerText = 'Start Session';
    });
  `;

  const pomodoroManifest: PluginManifest = {
    apiVersion: 1,
    id: "pomodoro-focus",
    name: "Pomodoro Focus",
    version: "1.0.0",
    description: "Tactile Pomodoro timer with customizable intervals and local session logging.",
    icon: "Clock",
    trust: "generated",
    capabilities: [],
    surfaces: [
      {
        id: "pomodoro-focus",
        title: "Pomodoro Focus",
        icon: "Clock",
        variant: "immersive",
        entry: "features/pomodoro-focus",
      },
    ],
    permissions: [],
  };

  // Upsert so existing checkouts pick up the fixed timer (working mode
  // switch, whitespace grouping, sentence case) without duplicate rows.
  const existing = count > 0
    ? (db.query<any, ["string"]>("SELECT code FROM registry_plugins WHERE id = ?").get("pomodoro-focus") as any)
    : null;
  if (existing && typeof existing.code === "string" && existing.code.includes("setMode")) {
    return;
  }
  if (existing) {
    db.query(
      "UPDATE registry_plugins SET description = ?, manifest_json = ?, code = ?, updated_at = ? WHERE id = ?"
    ).run(
      "Tactile Pomodoro timer with customizable intervals and local session logging.",
      JSON.stringify(pomodoroManifest),
      pomodoroCode,
      now,
      "pomodoro-focus"
    );
    return;
  }

  db.query(`
    INSERT INTO registry_plugins (id, name, description, icon, version, author, tags_json, manifest_json, code, downloads, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 48, ?, ?)
  `).run(
    "pomodoro-focus",
    "Pomodoro Focus",
    "Tactile Pomodoro timer with customizable intervals and local session logging.",
    "Clock",
    "1.0.0",
    "PolyDocks Team",
    JSON.stringify(["productivity", "timer", "focus"]),
    JSON.stringify(pomodoroManifest),
    pomodoroCode,
    now,
    now
  );
}
