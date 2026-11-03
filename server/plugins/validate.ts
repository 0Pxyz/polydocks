import { Window } from "happy-dom";
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
 * Design-slop patterns that make generated UI look foreign inside the app
 * (internal-docs/design-slop.md). Warning only, never a publish blocker: controls
 * like TabsList carry their own chrome, and edge cases exist. Each hit
 * nudges the agent toward the native look: borderless surfaces, whitespace
 * grouping, sentence case, normal tracking, theme tokens.
 */
const SLOP_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  {
    re: /bg-card[^"'`]*border-|border-(?:border|input)[^"'`]*bg-card/,
    hint: "bordered card container (bg-card + border). Let content breathe on the surface; separate with whitespace, or a borderless subtle surface step at most.",
  },
  {
    re: /<Separator[\s/>]/,
    hint: "<Separator> rule. Rely on whitespace, alignment, and grouping instead of horizontal rules.",
  },
  {
    re: /tracking-tight(?:er)?|tracking-widest/,
    hint: "tight/widest tracking. Use normal tracking; never negative tracking on UI text.",
  },
  {
    re: /uppercase/,
    hint: "uppercase styling. Prefer sentence case and let hierarchy do the work.",
  },
];

export function findSlopPatterns(code: string): string[] {
  const hits: string[] = [];
  for (const { re, hint } of SLOP_PATTERNS) {
    if (re.test(code)) hits.push(hint);
  }
  return hits;
}

/**
 * Hard lifecycle-contract violations (internal-docs/plugins/lifecycle.md). The host
 * owns mount/hide/hibernate; plugins must never control their own
 * lifecycle. Unlike style hints, these REJECT the plugin with a clear
 * error pointing at the fix.
 */
const LIFECYCLE_PATTERNS: Array<{ re: RegExp; error: string }> = [
  {
    re: /location\s*\.\s*reload\s*\(/,
    error:
      'Lifecycle contract: location.reload() is forbidden — the host keeps tabs mounted, so reload destroys guest state and interrupts tasks. Remove the call; state restores from polymax.storage on hibernate/restore.',
  },
  {
    re: /if\s*\(\s*!?\s*(isActive|activeTab|isVisible|isCurrentTab)\b/,
    error:
      'Lifecycle contract: conditional render on the active tab (isActive/activeTab/isVisible) is forbidden — the host mounts every tab once and hides inactive ones. Render unconditionally; use polymax.storage for state that must survive.',
  },
  {
    re: /\b(isActive|activeTab|isVisible|isCurrentTab)\b\s*\?\s*[^:]+:\s*null/,
    error:
      'Lifecycle contract: rendering null when the tab is inactive is forbidden — hidden tabs keep running (streams, uploads, players continue). Render unconditionally.',
  },
  {
    re: /\b(isActive|activeTab|isVisible|isCurrentTab)\b\s*&&\s*\(?\s*</,
    error:
      'Lifecycle contract: gating JSX on the active tab (X && <.../>) is forbidden — the host hides inactive tabs with CSS while they keep running. Render unconditionally.',
  },
  {
    re: /key\s*=\s*\{[^}]*(activeTab|isActive|isVisible|activeToolId)[^}]*\}/,
    error:
      'Lifecycle contract: a key derived from the active tab forces a remount on every switch — forbidden. Use a stable id; the host owns mount/unmount.',
  },
];

export function findLifecycleViolations(code: string): string[] {
  const hits: string[] = [];
  for (const { re, error } of LIFECYCLE_PATTERNS) {
    if (re.test(code)) hits.push(error);
  }
  return hits;
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

    // Scheduler globals the kit renderer expects (from the Node runtime).
    try {
      if (typeof MessageChannel !== "undefined" && typeof (win as any).MessageChannel === "undefined") {
        (win as any).MessageChannel = MessageChannel;
      }
    } catch {
      // best effort
    }

    run(getKitJs());
    const kit = (win as any).__polymaxKit;
    if (!kit?.React) {
      return { ok: false, error: "UI kit failed to initialize in the render test" };
    }

    // Browser APIs components may touch during render; inert no-ops here.
    // Plus a stub window.polymax bridge: production always defines it before
    // guest code runs, so module-scope bridge calls must not crash validation.
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
        const bridgeStub = {
          storage: { get: async () => null, set: async () => true, remove: async () => true },
          invoke: async () => null,
          useCapability: async () => null,
          invokeAction: async () => null,
          openUrl: () => {},
          openContent: () => {},
          getContext: async () => ({}),
          submit: () => {},
          ui: { expand: () => {}, collapse: () => {} },
        };
        window.polymax = window.polymax || bridgeStub;
        window.polydocks = window.polydocks || window.polymax;
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
      // The kit's own server renderer: same React copy as the components.
      html = kit.renderToString(captured as any);
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

  // Kit v2 gate: raw elements / hex / inline style / no kit usage reject
  // with a fixable report (caller retries up to 2 times).
  const { validateKitUsage } = await import("./kitValidator");
  const kitReport = validateKitUsage(input.code);

  for (const slop of findSlopPatterns(input.code)) {
    warnings.push(`Design slop (internal-docs/design-slop.md): ${slop} Warning only for now.`);
  }

  const lifecycle = findLifecycleViolations(input.code);
  if (lifecycle.length > 0) {
    return { ok: false, error: lifecycle.join(" "), warnings };
  }

  if (!kitReport.ok) {
    return {
      ok: false,
      error: `Kit v2 violation (attempt 1 of 2 then fix and retry): ${kitReport.errors.join("; ")}. Call ui_catalog for the right component, compose from the kit, no raw HTML/CSS.`,
      warnings: [...warnings, ...kitReport.warnings],
    };
  }
  for (const w of kitReport.warnings) warnings.push(w);

  const render = await validatePluginRender(guestJs);
  if (!render.ok) return { ok: false, error: render.error, warnings };
  return { ok: true, warnings };
}
