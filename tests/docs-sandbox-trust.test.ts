import { describe, it, expect } from "bun:test";
import fs from "node:fs";

/** Doc-rot guard for internal-docs/sandbox-trust.md (#183): every enforcement pointer must hold. */
describe("sandbox-trust doc pointers", () => {
  const read = (p: string) => fs.readFileSync(p, "utf-8");
  // Private team doc (gitignored): skip on public checkouts.
  const hasDoc = fs.existsSync("internal-docs/sandbox-trust.md");
  const docIt = hasDoc ? it : it.skip;
  const doc = () => read("internal-docs/sandbox-trust.md");

  docIt("states the two tiers and the intended (unenforced) items", () => {
    expect(doc()).toContain("First-party (global)");
    expect(doc()).toContain("User (generated / external)");
    expect(doc()).toContain("Intended, not yet enforced");
    expect(doc()).toContain("No signing infrastructure exists");
  });

  it("iframe isolation pointer holds", () => {
    expect(read("src/features/dock/DynamicPluginSandbox.tsx")).toContain('sandbox="allow-scripts"');
    expect(read("src/features/dock/DynamicPluginSandbox.tsx")).toContain("srcDoc");
  });

  it("bridge-only pointer holds", () => {
    const guest = read("src/features/dock/bridge/guest-bridge.js");
    for (const m of ["storage.get", "openUrl", "getContext", "postMessage"]) expect(guest).toContain(m);
  });

  it("host-side gate pointers hold", () => {
    expect(read("server/plugins/bus.ts")).toContain("public async invoke");
    expect(read("server/plugins/policy.ts")).toContain("evaluateCapabilityPolicy");
    expect(read("server/plugins/risk.ts")).toContain("RISK_LADDER");
    expect(read("server/plugins/manifest.ts")).toContain("PermissionSchema");
    expect(read("server/agent/manifest.ts")).toContain("AGENT_MANIFEST");
  });

  it("official events originate host-side only", () => {
    expect(read("server/agent/loop.ts")).toContain("plugin.created");
    const guest = read("src/features/dock/bridge/guest-bridge.js");
    expect(guest).not.toContain("plugin.created");
  });
});
