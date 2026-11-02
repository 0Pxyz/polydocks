import { describe, expect, it } from "bun:test";
import { BITCOIN_CODE } from "./bitcoin.code";
import { POMODORO_CODE } from "./pomodoro-focus.code";
import { validateKitUsage } from "../kitValidator";
import { validatePluginCode } from "../validate";
import { bundleFeatureCode } from "../../workspace/reactKit";

/**
 * Shipped seeds prove the migration: bitcoin + pomodoro guest code lives
 * in ./seeds (registry owns manifest + upsert only) and both pass the
 * kit gate and render against the vendored bundle.
 */
describe("seeded plugin guest code (kit v2 migration)", () => {
  for (const [name, code] of [["bitcoin", BITCOIN_CODE], ["pomodoro-focus", POMODORO_CODE]] as const) {
    it(`${name}: passes the kit gate (no raw elements, hex, inline style)`, () => {
      const r = validateKitUsage(code);
      expect(r.ok, `${name}: ${r.errors.join("; ")}`).toBe(true);
    });

    it(`${name}: renders against the vendored bundle`, async () => {
      const res = await validatePluginCode({ code, bundle: bundleFeatureCode });
      expect(res.ok, `${name}: ${res.error}`).toBe(true);
    }, 60000);
  }
});
