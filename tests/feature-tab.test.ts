import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  transpileFeatureCode,
  buildFeatureSrcdoc,
  writeFeature,
  readFeature,
  listFeatures,
  deleteFeature,
} from "../server/workspace/features";
import { create_tab, update_tab, delete_tab } from "../server/agent/tools";
import { writeCityFile } from "../server/workspace/cityWorkspace";

const TEST_CITY = "test-city-feature-tabs";
const TEST_DIR = path.resolve(process.cwd(), "workspace", TEST_CITY);

describe("Feature Modules & Dynamic Tab Runtime", () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("deterministically strips TypeScript types without running guest code", () => {
    const inputTs = `
      interface Card {
        id: string;
        question: string;
        answer: string;
      }
      const card: Card = { id: "1", question: "What is a Qubit?", answer: "A two-level quantum system" };
      function getAnswer(c: Card): string {
        return c.answer;
      }
    `;

    const js = transpileFeatureCode(inputTs);
    expect(js).toContain("const card =");
    expect(js).toContain("function getAnswer(c)");
    expect(js).not.toContain("interface Card");
    expect(js).not.toContain(": Card");
  });

  it("rejects non-allowlisted imports with a clear error", () => {
    const maliciousCode = `
      import fs from "node:fs";
      const data = fs.readFileSync("/etc/passwd");
    `;

    expect(() => transpileFeatureCode(maliciousCode)).toThrow(
      'Security Violation: Import "node:fs" is not allowed in plugin code.'
    );

    const relativeImport = `
      import { helper } from "./helper.js";
    `;

    expect(() => transpileFeatureCode(relativeImport)).toThrow(
      'Security Violation: Import "./helper.js" is not allowed in plugin code.'
    );
  });

  it("accepts allowlisted React and shadcn imports for kit bundling", () => {
    const reactCode = `
      import { Button } from "@/components/ui/button";
      import { useState } from "react";
    `;
    expect(() => transpileFeatureCode(reactCode)).not.toThrow();
  });

  it("builds sandboxed srcdoc with design tokens and polymax bridge", () => {
    const sampleJs = "console.log('Mounted');";
    const manifest = { id: "test-tab", title: "Test Tab" };
    const srcdoc = buildFeatureSrcdoc(sampleJs, manifest);

    // Dark theme tokens
    expect(srcdoc).toContain("--bg: #0A0A0C");
    expect(srcdoc).toContain("--accent: #C8FF57");
    expect(srcdoc).toContain("--surface: #131318");

    // Bridge API
    expect(srcdoc).toContain("window.polymax =");
    expect(srcdoc).toContain("storage.get");
    expect(srcdoc).toContain("ui.expand");
    expect(srcdoc).toContain("openUrl");

    // CSP: no external scripts/styles (what the prompt promises)
    expect(srcdoc).toContain('http-equiv="Content-Security-Policy"');
    expect(srcdoc).toContain("script-src 'unsafe-inline'");

    // Code inclusion
    expect(srcdoc).toContain("console.log('Mounted');");
  });

  it("writes and reads versioned feature modules in workspace/<city>/features/", async () => {
    const code = `
      interface Goal { title: string; done: boolean; }
      const g: Goal = { title: "Master Superposition", done: false };
      document.getElementById("app").innerText = g.title;
    `;

    const writeRes = await writeFeature(TEST_CITY, "quantum-goals", {
      manifest: { id: "quantum-goals", title: "Quantum Goals", icon: "Target" },
      code,
    });

    expect(writeRes.manifest.id).toBe("quantum-goals");
    expect(writeRes.compiledSrcdoc).toContain("Master Superposition");

    // Read back
    const featureData = await readFeature(TEST_CITY, "quantum-goals");
    expect(featureData.format).toBe("feature-ts");
    expect(featureData.code).toContain("interface Goal");
    expect(featureData.srcdoc).toContain("Master Superposition");
  });

  it("maintains seamless backward compatibility with legacy HTML blob tabs", async () => {
    const legacyHtml = "<!DOCTYPE html><html><body><h1>Legacy Tab</h1></body></html>";
    const legacyManifest = { id: "legacy-tab", title: "Legacy Tab", icon: "Layers" };

    // Write directly to legacy tabs/<tabId>/
    await writeCityFile(TEST_CITY, "tabs/legacy-tab/manifest.json", JSON.stringify(legacyManifest));
    await writeCityFile(TEST_CITY, "tabs/legacy-tab/index.html", legacyHtml);

    const read = await readFeature(TEST_CITY, "legacy-tab");
    expect(read.format).toBe("legacy-html");
    expect(read.srcdoc).toBe(legacyHtml);
    expect(read.manifest.title).toBe("Legacy Tab");
  });

  it("lists all registered features and tabs across workspace", async () => {
    const list = await listFeatures(TEST_CITY);
    const ids = list.map((f) => f.id);
    expect(ids).toContain("quantum-goals");
    expect(ids).toContain("legacy-tab");
  });

  it("integrates with create_tab and update_tab agent tools", async () => {
    // 1. Tool create_tab with code
    const createRes = (await create_tab.execute(
      {
        id: "concept-matrix",
        title: "Concept Matrix",
        code: "const mastery: number = 75; console.log(mastery);",
      },
      { cityId: TEST_CITY, step: 1 }
    )) as any;

    expect(createRes.success).toBe(true);
    expect(createRes.format).toBe("feature-ts");

    // 2. Tool update_tab with code
    const updateRes = (await update_tab.execute(
      {
        id: "concept-matrix",
        code: "const mastery: number = 90; console.log(mastery);",
      },
      { cityId: TEST_CITY, step: 2 }
    )) as any;

    expect(updateRes.success).toBe(true);
    expect(updateRes.format).toBe("feature-ts");

    const feat = await readFeature(TEST_CITY, "concept-matrix");
    expect(feat.code).toContain("90");

    // 3. Direct deleteFeature check
    await deleteFeature(TEST_CITY, "quantum-goals");
    const remaining = await listFeatures(TEST_CITY);
    expect(remaining.map((f) => f.id)).not.toContain("quantum-goals");

    // 4. Delete tool
    const deleteRes = (await delete_tab.execute(
      {
        id: "concept-matrix",
        userApproved: true,
      },
      { cityId: TEST_CITY, step: 3 }
    )) as any;

    expect(deleteRes.success).toBe(true);
    expect(deleteRes.action).toBe("tab.deleted");
  });
});
