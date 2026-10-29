import { describe, expect, it } from "bun:test";
import { db } from "../workspace/db";
import { validatePluginRender, validatePluginCode, findHardcodedHex, findSlopPatterns } from "./validate";
import { bundleFeatureCode } from "../workspace/reactKit";
import { PluginService } from "../services/pluginService";

const GOOD = `import { Button } from "@/components/ui/button";
import { createRoot } from "react-dom/client";
function App() { return <Button>hi</Button>; }
createRoot(document.getElementById("app")).render(<App />);`;

const THROWING = `import { Button } from "@/components/ui/button";
import { createRoot } from "react-dom/client";
function App() { throw new Error("boom"); return <Button>x</Button>; }
createRoot(document.getElementById("app")).render(<App />);`;

describe("Pre-publish validation", () => {
  it("renders valid TSX without throwing", async () => {
    const res = await validatePluginCode({ code: GOOD, bundle: bundleFeatureCode });
    expect(res.ok).toBe(true);
    expect(res.warnings).toEqual([]);
  });

  it("fails code that throws during render", async () => {
    const res = await validatePluginRender(bundleFeatureCode(THROWING));
    expect(res.ok).toBe(false);
    expect(res.error).toContain("boom");
  });

  it("fails code that mounts nothing", async () => {
    const res = await validatePluginRender(bundleFeatureCode(`console.log("no mount");`));
    expect(res.ok).toBe(false);
    expect(res.error).toContain("#app is empty");
  });

  it("warns on hardcoded hex instead of hard-rejecting", async () => {
    expect(findHardcodedHex(`color: #C8FF57; border: 1px solid #fff;`)).toEqual(
      expect.arrayContaining(["#C8FF57", "#fff"])
    );
    expect(findHardcodedHex(`color: var(--primary);`)).toEqual([]);
    const res = await validatePluginCode({
      code: `${GOOD}\nconst c = "#C8FF57";`,
      bundle: bundleFeatureCode,
    });
    expect(res.ok).toBe(true);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain("#C8FF57");
  });

  it("warns on design slop instead of hard-rejecting", async () => {
    const sloppy = `${GOOD}\nconst x = '<div className="rounded-xl border border-border bg-card"><Separator /><p className="uppercase tracking-tight">hi</p></div>';`;
    expect(findSlopPatterns(sloppy).length).toBeGreaterThan(0);
    expect(findSlopPatterns(GOOD)).toEqual([]);
    const res = await validatePluginCode({ code: sloppy, bundle: bundleFeatureCode });
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => w.includes("Design slop"))).toBe(true);
  });

  it("blocks activation when the render test fails, keeping the previous version live", async () => {
    const id = "test-validation-block";
    const ws = "test-validation-ws";
    db.query("DELETE FROM plugins WHERE id = ?").run(id);
    db.query("DELETE FROM plugin_files WHERE workspace_id = ?").run(ws);
    db.query("DELETE FROM workspace_plugins WHERE plugin_id = ?").run(id);

    const first = await PluginService.synthesizePlugin({
      id,
      name: "Validation Target",
      description: "blocked publish test",
      code: GOOD,
      workspaceId: ws,
    });
    expect(first.success).toBe(true);

    const blocked = await PluginService.modifyPlugin({
      id,
      code: THROWING,
      changeSummary: "broken change",
      workspaceId: ws,
    });
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain("boom");

    const { PluginRegistry } = await import("./registry");
    expect(PluginRegistry.getInstance().get(id)?.version).toBe("1.0.0");

    db.query("DELETE FROM plugins WHERE id = ?").run(id);
    db.query("DELETE FROM plugin_files WHERE workspace_id = ?").run(ws);
    db.query("DELETE FROM workspace_plugins WHERE plugin_id = ?").run(id);
    db.query("DELETE FROM plugin_versions WHERE plugin_id = ?").run(id);
  });
});
