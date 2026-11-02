import { describe, expect, it } from "bun:test";
import { db } from "../workspace/db";
import { validatePluginRender, validatePluginCode, findHardcodedHex, findSlopPatterns, findLifecycleViolations } from "./validate";
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

  it("rejects hardcoded hex with a fixable kit error", async () => {
    expect(findHardcodedHex(`color: #C8FF57; border: 1px solid #fff;`)).toEqual(
      expect.arrayContaining(["#C8FF57", "#fff"])
    );
    expect(findHardcodedHex(`color: var(--primary);`)).toEqual([]);
    const res = await validatePluginCode({
      code: `${GOOD}\nconst c = "#C8FF57";`,
      bundle: bundleFeatureCode,
    });
    expect(res.ok).toBe(false);
    expect(res.error || "").toContain("Kit v2 violation");
  });

  it("warns on design slop instead of hard-rejecting", async () => {
    const sloppy = `${GOOD}\nconst x = '<div className="rounded-xl border border-border bg-card"><Separator /><p className="uppercase tracking-tight">hi</p></div>';`;
    expect(findSlopPatterns(sloppy).length).toBeGreaterThan(0);
    expect(findSlopPatterns(GOOD)).toEqual([]);
    const res = await validatePluginCode({ code: sloppy, bundle: bundleFeatureCode });
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => w.includes("Design slop"))).toBe(true);
  });

  it("rejects lifecycle-contract violations with a clear error, not a warning", async () => {
    const violations: Array<[string, string]> = [
      ["location.reload()", `function App() { location.reload(); return <div/>; }`],
      ["early return on isActive", `function App({ isActive }) { if (!isActive) return null; return <div/>; }`],
      ["ternary to null", `function App({ isActive }) { return isActive ? <div/> : null; }`],
      ["gated JSX", `function App({ activeTab }) { return <div>{activeTab && <span/>}</div>; }`],
      ["active-derived key", `function App({ activeTab }) { return <div key={activeTab}>x</div>; }`],
    ];
    for (const [label, body] of violations) {
      const code = `import { createRoot } from "react-dom/client";\n${body}\ncreateRoot(document.getElementById("app")).render(<App />);`;
      expect(findLifecycleViolations(code).length, label).toBeGreaterThan(0);
      const res = await validatePluginCode({ code, bundle: bundleFeatureCode });
      expect(res.ok, label).toBe(false);
      expect(res.error || "", label).toContain("Lifecycle contract");
    }
    // Contract-compliant code (storage + task APIs, unconditional render) passes.
    const compliant = `import { createRoot } from "react-dom/client";
function App() {
  const [v, setV] = React.useState(null);
  React.useEffect(() => { window.polymax.storage.get("v").then(setV); }, []);
  const run = () => { window.polymax.task.start({ label: "Export" }).then(({ id }) => window.polymax.task.done(id)); };
  return <div><button onClick={run}>go</button><span>{v}</span></div>;
}
createRoot(document.getElementById("app")).render(<App />);`;
    expect(findLifecycleViolations(compliant)).toEqual([]);
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
