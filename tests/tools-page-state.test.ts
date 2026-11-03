import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveRowAction } from "../src/lib/dock/dockModel";

const viewPath = resolve(__dirname, "../src/features/plugins/PluginsView.tsx");
const surfacePath = resolve(__dirname, "../src/features/dock/ToolSurface.tsx");
const onboardingPath = resolve(__dirname, "../src/features/onboarding/OnboardingPluginView.tsx");
const appPath = resolve(__dirname, "../src/App.tsx");

/**
 * Tools page state (#382): Creations duplicated Tools, the onboarding row
 * opened a blank viewport when idle, and session tools vanished on
 * refresh. The row contract is a pure helper so regressions show here.
 */
describe("tools page state (#382)", () => {
  test("row contract: open / enable / details", () => {
    // Notes has no manifest surface but a ToolSurface route: opens.
    expect(resolveRowAction({ id: "notes", enabled: true, surfaces: [] })).toBe("open");
    expect(
      resolveRowAction({ id: "box-breathing", enabled: true, surfaces: [{ id: "box-breathing" }] })
    ).toBe("open");
    // Capability-only: no view, Details sheet.
    for (const id of ["search", "sources", "files", "sandbox", "kit-gallery"]) {
      expect(resolveRowAction({ id, enabled: true, surfaces: [] })).toBe("details");
    }
    expect(resolveRowAction({ id: "gtm-reader", enabled: true, surfaces: [] })).toBe("details");
    // Disabled rows enable instead of opening.
    expect(resolveRowAction({ id: "notes", enabled: false, surfaces: [] })).toBe("enable");
    expect(
      resolveRowAction({ id: "box-breathing", enabled: false, surfaces: [{ id: "box-breathing" }] })
    ).toBe("enable");
  });

  test("row uses the shared contract (no inline rule to drift)", () => {
    const view = readFileSync(viewPath, "utf-8");
    expect(view).toContain("resolveRowAction(plugin)");
    expect(view).toContain('resolveRowAction(selectedPlugin) === "open"');
  });

  test("creations is generated-only (no second installed list)", () => {
    const surface = readFileSync(surfacePath, "utf-8");
    expect(surface).toContain('lockTrust={toolId === "creations" ? "generated" : undefined}');
    const view = readFileSync(viewPath, "utf-8");
    expect(view).toContain("lockTrust?: PluginItem[\"trust\"]");
    expect(view).toContain("lockTrust ? plugins.filter((p) => p.trust === lockTrust) : plugins");
    expect(view).toContain('"Creations"');
    expect(view).toContain("Built with the agent, mounted in your dock.");
  });

  test("idle onboarding offers replay instead of a blank viewport", () => {
    const onboarding = readFileSync(onboardingPath, "utf-8");
    expect(onboarding).toContain("Replay walkthrough");
    expect(onboarding).toContain("startDemo(true)");
    // Mounted tab never blanks: no null render on any state (#384).
    expect(onboarding).not.toContain("return null");
    expect(onboarding).toContain('if (!isOpen || currentStep === "idle")');
  });

  test("session tools survive refresh (open items stay in dock + viewport)", () => {
    const app = readFileSync(appPath, "utf-8");
    expect(app).toContain("EXTRA_TOOLS_KEY");
    expect(app).toContain("useState<DockToolItem[]>(loadExtraTools)");
    expect(app).toContain("platformStorage.setItem<PersistedExtraTool[]>");
  });
});
