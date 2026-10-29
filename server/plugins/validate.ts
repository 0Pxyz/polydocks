import { Window } from "happy-dom";
import { renderToString } from "react-dom/server";
import { getKitJs } from "../workspace/reactKit";

export interface RenderValidation {
  ok: boolean;
  error?: string;
  warnings: string[];
}

/**
 * Finds hardcoded hex colors in guest code. Warning only (not a hard reject
 * yet): the kit covers most needs, but layout CSS may still need odd values.
 * Theme tokens (var(--...)) never trigger this.
 */
export function findHardcodedHex(code: string): string[] {
  const found = new Set<string>();
  for (const m of code.matchAll(/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g)) {
    found.add(m[0]);
  }
  return [...found];
}

/**
 * Mounts the bundled guest JS in a server-side DOM (happy-dom) with the real
 * vendored kit: createRoot is stubbed to capture the root element, which is
 * then rendered with react-dom/server. Asserts it renders without throwing.
 * No Playwright, no browser; runs in-process under bun test.
 * Bridge calls to window.parent are sunk, never delivered.
 *
 * Limitation: render-phase only — effects/handlers that fail later still
 * surface at runtime via the experience error collector + verifyPluginState.
 */
export async function validatePluginRender(guestJs: string): Promise<{ ok: boolean; error?: string }> {
  const win = new Window({ url: "https://sandbox.local/" });
  try {
    win.document.write(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`);
    const run = (win as any).eval.bind(win) as (src: string) => unknown;

    run(getKitJs());
    const kit = (win as any).__polymaxKit;
    if (!kit?.React) {
      return { ok: false, error: "UI kit failed to initialize in the render test" };
    }

    // Browser APIs components may touch during render; inert no-ops here.
    run(`(function() {
      try {
        if (typeof window.matchMedia !== "function") {
          window.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        }
        if (typeof window.ResizeObserver === "undefined") {
          window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
        }
        if (typeof window.IntersectionObserver === "undefined") {
          window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
        }
        try {
          Object.defineProperty(window, "parent", { value: { postMessage(){} }, configurable: true });
        } catch (e) { /* parent stays self; postMessage below still sunk */ }
        const sink = function(){};
        try { window.open = sink; } catch (e) {}
        if (!window.parent || !window.parent.postMessage) {
          try { window.parent = { postMessage: sink }; } catch (e) {}
        }
      } catch (e) { /* best effort */ }
    })();`);

    let captured: unknown = null;
    let renderCalls = 0;
    kit.ReactDOMClient.createRoot = () => ({
      render: (node: unknown) => {
        renderCalls += 1;
        captured = node;
      },
      unmount: () => {},
    });

    try {
      run(guestJs);
    } catch (err: any) {
      return { ok: false, error: `Render threw: ${err?.message || String(err)}` };
    }

    if (renderCalls === 0 || !captured) {
      return { ok: false, error: "Render produced no output: #app is empty (mount into #app with createRoot(...).render(...))" };
    }

    let html: string;
    try {
      html = renderToString(captured as any);
    } catch (err: any) {
      return { ok: false, error: `Render threw: ${err?.message || String(err)}` };
    }
    if (!html || html.trim().length === 0) {
      return { ok: false, error: "Render produced no output: component rendered empty" };
    }
    return { ok: true };
  } finally {
    try {
      win.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Full pre-publish validation: static bundle checks already ran in
 * bundleFeatureCode/transpileFeatureCode; here we mount and render.
 * Render failure blocks activation; hex usage is a warning only.
 */
export async function validatePluginCode(input: {
  code: string;
  bundle: (code: string) => string;
}): Promise<RenderValidation> {
  const warnings: string[] = [];
  let guestJs: string;
  try {
    guestJs = input.bundle(input.code);
  } catch (err: any) {
    return { ok: false, error: err?.message || "Bundling failed", warnings };
  }

  for (const hex of findHardcodedHex(input.code)) {
    warnings.push(
      `Hardcoded color ${hex} — prefer a theme token (var(--background), var(--primary), …) or a shadcn component. Warning only for now.`
    );
  }

  const render = await validatePluginRender(guestJs);
  if (!render.ok) return { ok: false, error: render.error, warnings };
  return { ok: true, warnings };
}
