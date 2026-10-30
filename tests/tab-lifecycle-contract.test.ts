import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PluginRegistry } from "../server/plugins/registry";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party/index";
import { listContractPlugins, checkPluginLifecycle } from "../server/plugins/lifecycle";
import { PluginService } from "../server/services/pluginService";
import { db } from "../server/workspace/db";
import {
  useTabHostStore,
  resetTabHostForTests,
  LIVE_TAB_LIMIT,
} from "../src/lib/tabs/tabHostStore";
import { useTabStateStore, clearTabState, resetTabStateForTests } from "../src/lib/tabs/useTabState";
import { platformStorage } from "../src/lib/platform/storage";

const GOOD_CODE = `import { createRoot } from "react-dom/client";
function App() {
  const [v, setV] = React.useState(null);
  React.useEffect(() => { window.polymax.storage.get("v").then(setV); }, []);
  const run = () => { window.polymax.task.start({ label: "Export" }).then(({ id }) => window.polymax.task.done(id)); };
  return <div><button onClick={run}>go</button><span>{v}</span></div>;
}
createRoot(document.getElementById("app")).render(<App />);`;

/**
 * Platform contract suite (issue #139): iterates the LIVE registry —
 * first-party, generated, community — so a newly added plugin joins
 * automatically. No hardcoded plugin list here on purpose.
 */
describe("tab lifecycle contract: every plugin, present and future", () => {
  beforeEach(() => {
    resetTabHostForTests();
    resetTabStateForTests();
    initializeFirstPartyPlugins();
  });

  it("enumerates installed plugins without a hardcoded list", () => {
    const plugins = listContractPlugins();
    const ids = plugins.map((p) => p.id);
    // First-party surface is always present via initializeFirstPartyPlugins.
    expect(ids).toContain("search");
    expect(ids).toContain("browser");
    // Deterministic order for stable reports.
    expect(ids).toEqual([...ids].sort());
  });

  it("a newly added plugin joins the suite automatically", async () => {
    const before = new Set(listContractPlugins().map((p) => p.id));
    const created = await PluginService.synthesizePlugin({
      id: "test-lifecycle-joiner",
      name: "Lifecycle Joiner",
      description: "Proves automatic suite inclusion",
      code: GOOD_CODE,
      workspaceId: "test-lifecycle-ws",
    });
    expect(created.success).toBe(true);
    try {
      const after = listContractPlugins();
      expect(before.has("test-lifecycle-joiner")).toBe(false);
      expect(after.map((p) => p.id)).toContain("test-lifecycle-joiner");
      const joiner = after.find((p) => p.id === "test-lifecycle-joiner")!;
      expect(joiner.code).toContain("polymax.task");
      expect(checkPluginLifecycle(joiner)).toEqual([]);
    } finally {
      db.query("DELETE FROM plugins WHERE id = ?").run("test-lifecycle-joiner");
      db.query("DELETE FROM plugin_files WHERE plugin_id = ?").run("test-lifecycle-joiner");
      db.query("DELETE FROM workspace_plugins WHERE plugin_id = ?").run("test-lifecycle-joiner");
      db.query("DELETE FROM plugin_versions WHERE plugin_id = ?").run("test-lifecycle-joiner");
    }
  });

  it("every plugin with guest code passes the hard lifecycle rules", () => {
    const violating = listContractPlugins().flatMap((p) => {
      const errors = checkPluginLifecycle(p);
      return errors.map((error) => ({ id: p.id, error }));
    });
    expect(violating).toEqual([]);
  });

  it("open A, B, C and back to A: 0 remounts, state and tasks survive hidden tabs", () => {
    const host = useTabHostStore.getState();
    host.openTab("plugin-a", "plugin");
    host.openTab("plugin-b", "plugin");
    host.openTab("plugin-c", "plugin");
    useTabStateStore.getState().setKey("plugin-a::filter", "videos");
    host.registerTask("plugin-a", { id: "export-1", label: "Export CSV" });

    host.activateTab("plugin-b");
    host.activateTab("plugin-a");

    const tabs = useTabHostStore.getState().tabs;
    expect(tabs["plugin-a"].mountCount).toBe(1);
    expect(useTabStateStore.getState().values["plugin-a::filter"]).toBe("videos");
    // The hidden tab's task still completes and stays queryable.
    host.updateTask("export-1", "done");
    expect(useTabHostStore.getState().tasksForTab("plugin-a")[0].status).toBe("done");
    clearTabState("plugin-a");
  });

  it("hibernation above the limit restores persisted state on reopen", () => {
    const host = useTabHostStore.getState();
    for (let i = 0; i < LIVE_TAB_LIMIT + 1; i++) {
      host.openTab(`plugin-${i}`, "plugin");
    }
    useTabStateStore.getState().setKey("plugin-0::draft", "hello");
    expect(useTabHostStore.getState().tabs["plugin-0"].status).toBe("hibernated");

    host.openTab("plugin-0", "plugin");
    const tabs = useTabHostStore.getState().tabs;
    expect(tabs["plugin-0"].status).toBe("live");
    // One expected remount; state restored from the persisted store.
    expect(tabs["plugin-0"].mountCount).toBe(2);
    expect(useTabStateStore.getState().values["plugin-0::draft"]).toBe("hello");
    expect(platformStorage.getItem<Record<string, unknown>>("polymax-tab-state")?.["plugin-0::draft"]).toBe(
      "hello"
    );
    clearTabState("plugin-0");
  });

  afterEach(() => {
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'test-%'").run();
  });
});
