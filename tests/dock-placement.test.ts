import { describe, expect, it } from "bun:test";
import {
  chatPlacement,
  CHAT_SIDE_MIN_WIDTH,
  TWO_PANEL_MIN_WIDTH,
} from "../src/lib/dock/dockItems";

/**
 * Single chat placement rule (#174 slice A). Side-by-side below the
 * two-panel width squeezed the panel while beside overlaid with a
 * different z-order; now both panels agree on one threshold owned here.
 */
describe("chat placement rule (#174)", () => {
  it("shares one threshold with the beside panel", () => {
    expect(CHAT_SIDE_MIN_WIDTH).toBe(TWO_PANEL_MIN_WIDTH);
  });

  it("docks side wide, overlays sheet narrow", () => {
    expect(chatPlacement(1920)).toBe("side");
    expect(chatPlacement(1100)).toBe("side");
    expect(chatPlacement(1099)).toBe("sheet");
    expect(chatPlacement(390)).toBe("sheet");
  });

  it("no local width check bypasses the single owner", async () => {
    for (const f of [
      "src/App.tsx",
      "src/lib/agent/conversationStore.ts",
      "src/lib/agent/orchestratorActions.ts",
    ]) {
      const src = await Bun.file(f).text();
      expect(src.includes("innerWidth >= 900")).toBe(false);
    }
  });
});
