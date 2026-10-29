import { describe, expect, it } from "bun:test";
import {
  bundleFeatureCode,
  compileGuestCss,
  rewriteKitImports,
  getKitExports,
  PLUGIN_CSP,
  UI_KIT_FILES,
} from "./reactKit";
import { buildReactSrcdoc, writeFeature, readFeature } from "./features";
import { getKitJs, getKitCss, getKitTokens } from "./reactKit";
import { db } from "./db";

const REACT_SAMPLE = `import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { createRoot } from "react-dom/client";
function App() {
  const [n, setN] = useState(0);
  return <div><Badge>count {n}</Badge><Button onClick={() => setN(n + 1)}>bump</Button></div>;
}
createRoot(document.getElementById("app")).render(<App />);`;

describe("React allowlist + vendored kit bundling", () => {
  it("ships all 17 shadcn components in the kit manifest", () => {
    expect(UI_KIT_FILES.length).toBe(17);
    expect(getKitExports()).toContain("Button");
    expect(getKitExports()).toContain("Dialog");
    expect(getKitExports()).toContain("Toaster");
  });

  it("bundles allowlisted imports to kit globals with normalized JSX runtime", () => {
    const js = bundleFeatureCode(REACT_SAMPLE);
    expect(js).toContain("window.__polymaxKit.React");
    expect(js).toContain("window.__polymaxKit.UI");
    expect(js).toContain("window.__polymaxKit.jsxDEV");
    expect(js).not.toMatch(/^\s*import\s/m);
    expect(js).not.toMatch(/\bjsxDEV_[A-Za-z0-9]+|\bjsx_[A-Za-z0-9]+|\bjsxs_[A-Za-z0-9]+/);
    expect(js).toContain("useState");
    expect(js).toContain("createRoot");
  });

  it("rejects every non-allowlisted import with a clear error", () => {
    const cases = [
      `import fs from "node:fs";\nconsole.log(1);`,
      `import { x } from "lodash";\nconsole.log(1);`,
      `import { h } from "./helper.js";\nconsole.log(1);`,
      `import "polyfill";\nconsole.log(1);`,
      `import { Nope } from "@/components/ui/button";\nconsole.log(1);`,
      `import { Button } from "@/components/ui/nonexistent";\nconsole.log(1);`,
    ];
    for (const bad of cases) {
      expect(() => rewriteKitImports(bad)).toThrow("Security Violation");
    }
    expect(() => rewriteKitImports(cases[0])).toThrow("Allowed imports:");
  });

  it("rejects export statements (single-file script contract)", () => {
    expect(() => bundleFeatureCode(`export default function A() {}\nconsole.log(1);`)).toThrow(
      "export statements are not allowed"
    );
  });

  it("compiles guest Tailwind utilities", async () => {
    const css = await compileGuestCss(`<div className="flex gap-4 p-2">x</div>`);
    expect(css).toContain(".flex");
  });

  it("builds a React srcdoc with CSP, kit bundle, and bridge", () => {
    const srcdoc = buildReactSrcdoc("console.log(1);", ".flex{display:flex}", { id: "x", title: "X" }, {
      js: getKitJs(),
      css: getKitCss(),
      tokens: getKitTokens(),
      csp: PLUGIN_CSP,
    });
    expect(srcdoc).toContain('http-equiv="Content-Security-Policy"');
    expect(srcdoc).toContain("script-src 'unsafe-inline'");
    // No external script/link tags (the kit bundle legitimately contains the
    // *string* "<script src=" inside react-dom/server output helpers).
    expect(srcdoc).not.toMatch(/<script[^>]*\bsrc\s*=\s*["']https?:/);
    expect(srcdoc).not.toMatch(/<link[^>]*\bhref\s*=\s*["']https?:/);
    // Kit assigns globalThis.__polymaxKit (=== window.__polymaxKit in browsers).
    expect(srcdoc).toContain("__polymaxKit");
    expect(srcdoc).toContain("openContent");
    expect(srcdoc).toContain("useCapability");
  });

  it("writeFeature routes import-bearing code through the React path", async () => {
    const ws = "test-react-kit-ws";
    const res = await writeFeature(ws, "react-kit-plug", {
      manifest: { id: "react-kit-plug", title: "React Kit" },
      code: REACT_SAMPLE,
    });
    expect(res.compiledSrcdoc).toContain("window.__polymaxKit");
    expect(res.compiledSrcdoc).toContain("Content-Security-Policy");
    const back = await readFeature(ws, "react-kit-plug");
    expect(back.code).toContain("useState");
    db.query("DELETE FROM plugin_files WHERE workspace_id = ?").run(ws);
  }, 30000);
});
