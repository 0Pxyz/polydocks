import type { StylePack } from "../types";

export const atlasStylePack: StylePack = {
  id: "atlas",
  name: "Cartographic Atlas",
  palette: {
    oceanDeep: "#060a12",
    oceanShallow: "#0c1527",
    oceanBorder: "#192642",
    landBase: "#131e33",
    landHighlight: "#1b2c49",
    hillshade: "rgba(0, 0, 0, 0.48)",
    coastlineGlow: "rgba(87, 200, 255, 0.28)",
    riverColor: "#38bdf8",
    roadColor: "rgba(203, 213, 225, 0.4)",
    regionBorderDash: "rgba(148, 163, 184, 0.35)",
    textPrimary: "#f8fafc",
    textMuted: "#94a3b8",
    graticuleColor: "rgba(255, 255, 255, 0.035)",
    vignetteIntensity: 0.65,
  },
};
