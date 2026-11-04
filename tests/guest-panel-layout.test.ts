import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Sidebar/panel list regression: guest surfaces rendered in a ~150px box
 * with cut cards and a native scrollbar. Root causes were all in the
 * height chain (beside wrapper not flex, surfaces missing min-h-0 so the
 * iframe fell back to its 150px default) plus missing guest base styles.
 */
describe("sidebar panel height chain", () => {
  const root = (...p: string[]) => readFileSync(resolve(__dirname, "..", ...p), "utf8");

  it("beside content wrapper is a flex column so surfaces can fill it", () => {
    const beside = root("src", "features", "dock", "BesidePanel.tsx");
    expect(beside).toContain("flex-1 min-w-0 w-full min-h-0 overflow-y-auto flex flex-col");
  });

  it("dock surfaces and the sandbox host can shrink inside flex parents", () => {
    const surface = root("src", "features", "dock", "DockSurface.tsx");
    expect(surface).toContain("flex-1 min-h-0 flex flex-col");
    const sandbox = root("src", "features", "dock", "DynamicPluginSandbox.tsx");
    expect(sandbox).toContain("h-full min-h-0 flex-1 flex flex-col");
  });

  it("feed panel fills height: fixed header, scrolling list, no fixed box", () => {
    const feed = readFileSync(
      resolve(__dirname, "../server/agent/tools/gtm-feed.fixture.tsx"),
      "utf8"
    );
    expect(feed).toContain("flex h-full flex-col");
    expect(feed).toContain("flex-none");
    expect(feed).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(feed).not.toContain("min-h-full flex-col");
  });

  it("mark-read uses the secondary design-system button, right aligned", () => {
    const feed = readFileSync(
      resolve(__dirname, "../server/agent/tools/gtm-feed.fixture.tsx"),
      "utf8"
    );
    expect(feed).toContain('variant="secondary"');
    expect(feed).not.toContain('variant="ghost"');
    expect(feed).toContain("justify-end");
  });
});
