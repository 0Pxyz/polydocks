import { describe, expect, test } from "bun:test";
import {
  isIOS,
  isStandaloneDisplay,
  resolveInstallStatus,
} from "../src/lib/platform/pwa";

describe("resolveInstallStatus", () => {
  test("standalone display means already installed", () => {
    expect(
      resolveInstallStatus({
        isStandalone: true,
        hasBeforeInstallPrompt: true,
        isIOS: false,
      })
    ).toBe("standalone");
  });

  test("native beforeinstallprompt offers one-tap install", () => {
    expect(
      resolveInstallStatus({
        isStandalone: false,
        hasBeforeInstallPrompt: true,
        isIOS: false,
      })
    ).toBe("prompt-ready");
  });

  test("iOS Safari without the event gets a manual hint", () => {
    expect(
      resolveInstallStatus({
        isStandalone: false,
        hasBeforeInstallPrompt: false,
        isIOS: true,
      })
    ).toBe("ios-hint");
  });

  test("unsupported browsers hide the entry point", () => {
    expect(
      resolveInstallStatus({
        isStandalone: false,
        hasBeforeInstallPrompt: false,
        isIOS: false,
      })
    ).toBe("unavailable");
  });
});

describe("isIOS", () => {
  test("matches Apple mobile Safari user agents", () => {
    expect(isIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIOS("Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X)")).toBe(true);
    expect(isIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15")).toBe(false);
    expect(isIOS("Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0")).toBe(false);
  });
});

describe("isStandaloneDisplay", () => {
  test("is false outside a DOM window", () => {
    // bun:test has no window at all; the guard must not throw.
    expect(isStandaloneDisplay()).toBe(false);
  });
});
