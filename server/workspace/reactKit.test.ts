import { describe, expect, it } from "bun:test";
import {
  bundleFeatureCode,
  compileGuestCss,
  rewriteKitImports,
  getKitExports,
  PLUGIN_CSP,
  UI_KIT_FILES,
} from "./reactKit";
import { buildReactSrcdoc, writeFeature, readFeature, GUEST_BASE_CSS } from "./features";
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
    expect(js).toContain("window.__polydocksKit.React");
    expect(js).toContain("window.__polydocksKit.UI");
    // Production JSX runtime: hashed helpers normalize to jsxs/jsx.
    expect(js).toContain("window.__polydocksKit.jsxs");
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

  it("kit css covers shadcn button scale utilities (no raw-HTML buttons)", () => {
    const css = getKitCss();
    for (const needle of [
      "text-primary-foreground",
      "bg-secondary",
      "h-9",
      "px-4",
      "gap-2",
      "text-sm",
      "animate-pulse",
      "size-9",
    ]) {
      expect(css).toContain(needle);
    }
  });

  it("guest css compiles scale utilities with the vendored theme", async () => {
    const css = await compileGuestCss(`<div className="grid gap-4 p-5">x</div>`);
    expect(css).toContain(".gap-4");
    expect(css).toContain(".p-5");
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
    // Kit assigns globalThis.__polydocksKit (=== window.__polydocksKit in browsers).
    expect(srcdoc).toContain("__polydocksKit");
    expect(srcdoc).toContain("openContent");
    expect(srcdoc).toContain("useCapability");
    // Guest base layer: full-height chain, no native button chrome.
    expect(srcdoc).toContain("scrollbar-width: thin");
  });

  it("guest base layer resets native chrome inside @layer base (utilities still win)", () => {
    // @layer base loses to @layer utilities, so shadcn variants keep
    // their backgrounds while bare buttons drop the gray native chrome.
    expect(GUEST_BASE_CSS).toContain("@layer base");
    expect(GUEST_BASE_CSS).toContain("html, body, #app");
    expect(GUEST_BASE_CSS).toContain("height: 100%");
    expect(GUEST_BASE_CSS).toContain("appearance: none");
    expect(GUEST_BASE_CSS).toContain("background: transparent");
    expect(GUEST_BASE_CSS).toContain("scrollbar-width: thin");
  });

  it("writeFeature routes import-bearing code through the React path", async () => {
    const ws = "test-react-kit-ws";
    const res = await writeFeature(ws, "react-kit-plug", {
      manifest: { id: "react-kit-plug", title: "React Kit" },
      code: REACT_SAMPLE,
    });
    expect(res.compiledSrcdoc).toContain("window.__polydocksKit");
    expect(res.compiledSrcdoc).toContain("Content-Security-Policy");
    const back = await readFeature(ws, "react-kit-plug");
    expect(back.code).toContain("useState");
    db.query("DELETE FROM plugin_files WHERE workspace_id = ?").run(ws);
  }, 30000);

  it("ships a production React build without development warnings", () => {
    const kit = getKitJs();
    expect(kit).toContain("globalThis.__polydocksKit");
    expect(kit).not.toContain("Internal React error");
    expect(kit).not.toContain("Download the React DevTools");
    expect(kit).not.toContain("__DEV__");
  });
});
