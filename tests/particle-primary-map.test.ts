import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const worldView = readFileSync(resolve(__dirname, "../src/features/views/WorldView.tsx"), "utf8");
const particleView = readFileSync(
  resolve(__dirname, "../src/features/world/particle/ParticleWorldView.tsx"),
  "utf8"
);
const canvas = readFileSync(
  resolve(__dirname, "../src/features/world/particle/ParticleWorldCanvas.tsx"),
  "utf8"
);

describe("Particle world is the primary Maps experience", () => {
  it("WorldView renders only the particle world (illustrated/ascii archived)", () => {
    expect(worldView).toContain("ParticleWorldView");
    expect(worldView).not.toContain("IllustratedWorldMap");
    expect(worldView).not.toContain("AsciiWorldView");
    expect(worldView).not.toContain("MapStylePicker");
    expect(worldView).not.toContain("MapImportModal");
    expect(worldView).not.toContain("engineMode");
    expect(worldView).not.toContain("min-h-screen");
  });

  it("unified view has no prototype chrome (selector, badge, seed controls)", () => {
    expect(particleView).not.toContain("PARTICLE_WORLDS_LIST");
    expect(particleView).not.toContain("Procedural Particle Engine");
    expect(particleView).not.toContain("Prototype");
    expect(particleView).not.toContain(">Seed:");
    expect(particleView).not.toContain("MapStylePicker");
    expect(particleView).toContain("buildKnowledgeWorldSpec");
    expect(particleView).toContain("fetchKnowledgeCities");
    expect(particleView).toContain("fetchWorldLinks");
    const knowledge = readFileSync(resolve(__dirname, "../src/features/world/knowledgeWorld.ts"), "utf8");
    expect(knowledge).toContain("/api/cities");
    expect(knowledge).toContain("/api/world/links");
  });

  it("city labels render as plain type (no boxes) and fade with zoom", () => {
    expect(canvas).toContain("shadowBlur");
    expect(canvas).not.toContain("Label Pill");
    expect(canvas).not.toContain("strokeRect");
    expect(canvas).not.toContain("pillPadX");
    expect(canvas).toContain("camera.zoom");
  });

  it("archived renderers remain in the codebase", () => {
    const illustrated = readFileSync(
      resolve(__dirname, "../src/features/world/IllustratedWorldMap.tsx"),
      "utf8"
    );
    const ascii = readFileSync(
      resolve(__dirname, "../src/features/world/ascii/AsciiWorldView.tsx"),
      "utf8"
    );
    const picker = readFileSync(resolve(__dirname, "../src/features/world/MapStylePicker.tsx"), "utf8");
    expect(illustrated.length).toBeGreaterThan(1000);
    expect(ascii.length).toBeGreaterThan(1000);
    expect(picker).toContain("MapStylePicker");
  });
});
