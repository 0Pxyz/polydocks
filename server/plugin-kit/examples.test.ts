import { describe, expect, it } from "bun:test";
import { KIT_EXAMPLES } from "./examples";
import { KIT_GALLERY_CODE } from "../plugins/first-party/kitGallery";
import { validateKitUsage } from "../plugins/kitValidator";
import { validatePluginCode } from "../plugins/validate";
import { bundleFeatureCode } from "../workspace/reactKit";

/**
 * Proof (J): five varied plugins (timer, lista, formulário, painel,
 * notas) pass the kit gate and render in at most one attempt, using
 * only catalog components. Plus: no hardcoded color survives, so a
 * workspace theme switch restyles every example with zero edits.
 */
describe("kit canonical examples", () => {
  it("covers timer, list, form, panel and notes", () => {
    const kinds = KIT_EXAMPLES.map((e) => e.kind).sort();
    expect(kinds).toEqual(["form", "list", "notes", "panel", "timer"]);
  });

  it("every example passes the kit gate (no raw elements, hex or inline style)", () => {
    for (const ex of KIT_EXAMPLES) {
      const r = validateKitUsage(ex.code);
      expect(r.ok, `${ex.name}: ${r.errors.join("; ")}`).toBe(true);
    }
  });

  it("no example hardcodes colors (theme switch needs no edits)", () => {
    const colorRe = /#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|bg-(black|white|zinc|neutral|slate|gray|stone)-/;
    for (const ex of KIT_EXAMPLES) {
      expect(colorRe.test(ex.code), ex.name).toBe(false);
    }
    expect(colorRe.test(KIT_GALLERY_CODE)).toBe(false);
  });

  it("every example renders against the vendored v2 bundle", async () => {
    for (const ex of KIT_EXAMPLES) {
      const res = await validatePluginCode({ code: ex.code, bundle: bundleFeatureCode });
      expect(res.ok, `${ex.name}: ${res.error}`).toBe(true);
    }
  }, 60000);

  it("the Kit Gallery passes the gate and renders", async () => {
    const gate = validateKitUsage(KIT_GALLERY_CODE);
    expect(gate.ok, gate.errors.join("; ")).toBe(true);
    const res = await validatePluginCode({ code: KIT_GALLERY_CODE, bundle: bundleFeatureCode });
    expect(res.ok, res.error).toBe(true);
  }, 60000);
});
