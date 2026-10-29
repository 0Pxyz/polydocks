import { describe, expect, it } from "bun:test";
import { buildFeatureSrcdoc, buildReactSrcdoc, escapeInlineScript } from "./features";
import { getKitJs, getKitCss, getKitTokens, PLUGIN_CSP } from "./reactKit";

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
    expect(vanilla).toContain('polymaxAction: "ui.ready"');

    const react = buildReactSrcdoc("console.log(1);", ".a{color:red}", {
      id: "test-ready-react",
      title: "Ready Test",
    } as any, { js: getKitJs(), css: getKitCss(), tokens: getKitTokens(), csp: PLUGIN_CSP });
    expect(react).toContain('polymaxAction: "ui.ready"');
    // Balanced even with the 1MB production kit inlined.
    const opens = react.match(/<script(\s|>)/gi) || [];
    const closes = react.match(/<\/script\s*>/gi) || [];
    expect(closes.length).toBe(opens.length);
  });
});
