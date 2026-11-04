import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { buildFeatureSrcdoc, buildReactSrcdoc, escapeInlineScript } from "./features";
import { bundleFeatureCode, getKitCss, getKitJs, getKitTokens, PLUGIN_CSP } from "./reactKit";

// Fixture shaped like minified react-dom output: a literal "</script>"
// inside a JS string. The HTML parser ends <script> at that literal even
// inside strings, so it must never reach the srcdoc unescaped.
const HOSTILE_JS =
  'h.innerHTML="<script></script>";var kd="</script>";c.push("<!-- -->");';

describe("escapeInlineScript: single helper for every inline path", () => {
  it("neutralizes sequences that terminate or alter the script element", () => {
    const out = escapeInlineScript(HOSTILE_JS);
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<!--");
    // Backslash-escaping is a JS no-op: runtime semantics are preserved.
    expect(out).toContain("<\\/script");
    expect(out).toContain("<\\!--");
    // eslint-disable-next-line no-eval
    expect(eval(`(${JSON.stringify(out)})`)).toBe(out);
  });

  it("is case-insensitive like the HTML parser", () => {
    expect(escapeInlineScript('a+"</SCRIPT>"+b')).toBe('a+"<\\/script>"+b');
    expect(escapeInlineScript("a<ScRiPt src=x>")).toContain("<\\script");
  });
});

describe("buildFeatureSrcdoc: hostile code cannot break out of <script>", () => {
  it("keeps script open/close tags balanced with minified react-dom-like input", () => {
    const srcdoc = buildFeatureSrcdoc(HOSTILE_JS, {
      id: "test-escape",
      title: "Escape Test",
    } as any);
    const opens = srcdoc.match(/<script(\s|>)/gi) || [];
    const closes = srcdoc.match(/<\/script\s*>/gi) || [];
    expect(closes.length).toBe(opens.length);
    // The hostile literal survives only in escaped form.
    expect(srcdoc).toContain("<\\/script>");
    expect(srcdoc).not.toContain('"<script></script>"');
  });

  it("emits a mount ready signal after guest code runs (vanilla + React)", () => {
    const vanilla = buildFeatureSrcdoc("console.log(1);", {
      id: "test-ready",
      title: "Ready Test",
    } as any);
    expect(vanilla).toContain('polydocksAction: "ui.ready"');

    const react = buildReactSrcdoc("console.log(1);", ".a{color:red}", {
      id: "test-ready-react",
      title: "Ready Test",
    } as any, { js: getKitJs(), css: getKitCss(), tokens: getKitTokens(), csp: PLUGIN_CSP });
    expect(react).toContain('polydocksAction: "ui.ready"');
    // Balanced even with the 1MB production kit inlined.
    const opens = react.match(/<script(\s|>)/gi) || [];
    const closes = react.match(/<\/script\s*>/gi) || [];
    expect(closes.length).toBe(opens.length);
  });
});

describe("react plugin mount regression (gtm-app-feed class)", () => {
  // A react-dom plugin whose bundle used to terminate <script> early and
  // render minified source as body text. Mounts in happy-dom with the real
  // vendored kit; the body must contain rendered UI, never bundle source.
  const REACT_MOUNT_FIXTURE = `import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "@/components/ui/badge";
function App() {
  const [n] = useState(3);
  return <div id="root">count <Badge>{n}</Badge></div>;
}
createRoot(document.getElementById("app")).render(<App />);`;

  it("mounts and renders without leaking bundle source into body text", async () => {
    const { MessageChannel } = await import("node:worker_threads");
    const guestJs = bundleFeatureCode(REACT_MOUNT_FIXTURE);
    const win = new Window({ url: "https://sandbox.local/" });
    // The kit bundle references MessageChannel at module scope (scheduler);
    // browsers provide it natively, happy-dom needs the Node shim.
    (win as any).MessageChannel = MessageChannel;
    try {
      win.document.write(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`);
      const run = (win as any).eval.bind(win) as (src: string) => unknown;
      run(getKitJs());
      run(`window.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){} });`);
      run(guestJs);
      // Let happy-dom flush effects/render.
      await new Promise((r) => setTimeout(r, 50));
      const text = win.document.body.textContent || "";
      expect(text).toContain("count");
      expect(text).not.toMatch(/createElement\(/);
      expect(text).not.toContain("Internal React error");
    } finally {
      try {
        (win.close() as unknown as Promise<void>)?.catch?.(() => {});
      } catch {
        // ignore close errors
      }
    }
  }, 30000);
});
