import { describe, it, expect } from "bun:test";
import { generateAsciiWorld, createRng } from "../src/features/world/ascii/generator";
import { CANONICAL_WORLDS, getAsciiWorld, listAsciiWorlds } from "../src/features/world/ascii/worlds";
import { plan_ascii_world } from "../server/agent/tools/plan_ascii_world";
import app from "../server/index";

describe("Procedural ASCII World Engine (Maps Experiment)", () => {
  describe("Deterministic Generation & Seed Invariance", () => {
    it("guarantees identical ASCII grid for identical (world, seed) pairs", () => {
      const world = CANONICAL_WORLDS["neural-networks"];
      const grid1 = generateAsciiWorld(world, { width: 100, height: 50, customSeed: 42817 });
      const grid2 = generateAsciiWorld(world, { width: 100, height: 50, customSeed: 42817 });

      expect(grid1.width).toBe(100);
      expect(grid1.height).toBe(50);
      expect(grid1.cells.length).toBe(50);
      expect(grid1.cells[0].length).toBe(100);

      // Compare character matrix cell by cell
      for (let r = 0; r < 50; r++) {
        for (let c = 0; c < 100; c++) {
          expect(grid1.cells[r][c].char).toBe(grid2.cells[r][c].char);
          expect(grid1.cells[r][c].color).toBe(grid2.cells[r][c].color);
          expect(grid1.cells[r][c].regionId).toBe(grid2.cells[r][c].regionId);
        }
      }
    });

    it("produces meaningfully distinct terrain and layout variations for different seeds", () => {
      const world = CANONICAL_WORLDS["neural-networks"];
      const gridA = generateAsciiWorld(world, { width: 100, height: 50, customSeed: 11111 });
      const gridB = generateAsciiWorld(world, { width: 100, height: 50, customSeed: 99999 });

      let differences = 0;
      for (let r = 0; r < 50; r++) {
        for (let c = 0; c < 100; c++) {
          if (gridA.cells[r][c].char !== gridB.cells[r][c].char) {
            differences++;
          }
        }
      }

      // Over 25% of grid characters should differ across distant seeds
      const totalCells = 100 * 50;
      expect(differences / totalCells).toBeGreaterThan(0.25);
    });

    it("PRNG Mulberry32 produces deterministic pseudo-random sequences", () => {
      const rng1 = createRng(12345);
      const rng2 = createRng(12345);

      const seq1 = Array.from({ length: 10 }, () => rng1());
      const seq2 = Array.from({ length: 10 }, () => rng2());

      expect(seq1).toEqual(seq2);
    });
  });

  describe("Canonical Test Worlds Support", () => {
    it("renders Neural Networks world with all 5 regions and road connections", () => {
      const nn = getAsciiWorld("neural-networks");
      expect(nn.id).toBe("neural-networks");
      expect(nn.regions.length).toBe(5);

      const grid = generateAsciiWorld(nn, { width: 120, height: 60 });
      expect(grid.regionCenters.size).toBe(5);

      // Verify region landmarks exist in the grid
      const landmarksFound = new Set<string>();
      let roadCellsFound = 0;

      for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
          const cell = grid.cells[r][c];
          if (cell.isLandmark) landmarksFound.add(cell.char);
          if (cell.isPath) roadCellsFound++;
        }
      }

      // Landmarks from NN: ◬, ▲, ◈, ✦, ⚙
      expect(landmarksFound.size).toBeGreaterThanOrEqual(4);
      expect(roadCellsFound).toBeGreaterThan(50);
    });

    it("renders Stoicism world with philosophical concepts and territories", () => {
      const stoic = getAsciiWorld("stoicism");
      expect(stoic.id).toBe("stoicism");
      expect(stoic.regions.length).toBe(5);

      const grid = generateAsciiWorld(stoic, { width: 120, height: 60 });
      expect(grid.regionCenters.has("dichotomy-of-control")).toBe(true);
      expect(grid.regionCenters.has("cardinal-virtues")).toBe(true);
      expect(grid.regionCenters.has("amor-fati")).toBe(true);
      expect(grid.regionCenters.has("memento-mori")).toBe(true);
      expect(grid.regionCenters.has("logos")).toBe(true);
    });

    it("renders Poker Strategy world with game-theory regions and card glyph landmarks", () => {
      const poker = getAsciiWorld("poker");
      expect(poker.id).toBe("poker");
      expect(poker.regions.length).toBe(5);

      const grid = generateAsciiWorld(poker, { width: 120, height: 60 });
      expect(grid.regionCenters.has("preflop-ranges")).toBe(true);
      expect(grid.regionCenters.has("pot-odds")).toBe(true);
      expect(grid.regionCenters.has("c-betting")).toBe(true);
      expect(grid.regionCenters.has("gto-solvers")).toBe(true);
      expect(grid.regionCenters.has("river-play")).toBe(true);
    });

    it("lists all available canonical worlds", () => {
      const worlds = listAsciiWorlds();
      expect(worlds.length).toBe(3);
      expect(worlds.map((w) => w.id)).toEqual(["neural-networks", "stoicism", "poker"]);
    });
  });

  describe("Agent Integration & plan_ascii_world Tool", () => {
    it("synthesizes valid AsciiWorldSpec without requiring LLM calls", async () => {
      const res = await plan_ascii_world.execute({
        subject: "Quantum Computing",
      });

      expect(res.success).toBe(true);
      expect(res.world.id).toBe("quantum-computing");
      expect(res.world.regions.length).toBe(3);
      expect(res.world.regions[0].label).toContain("Foundations");

      // Verify generated spec is immediately renderable by the procedural engine
      const grid = generateAsciiWorld(res.world, { width: 100, height: 50 });
      expect(grid.regionCenters.size).toBe(3);
    });

    it("accepts custom regions and connections for complex subjects", async () => {
      const res = await plan_ascii_world.execute({
        subject: "Biohacking",
        seed: 8888,
        regions: [
          {
            id: "sleep-circadian",
            label: "Circadian Rhythm",
            summary: "Melatonin, adenosine, and sleep architecture optimization.",
            biome: "forest",
            landmark: "☾",
            concepts: ["adenosine", "light-exposure", "rem-sleep"],
            connections: ["nootropics"],
          },
          {
            id: "nootropics",
            label: "Nootropic Compounds",
            summary: "Cognitive enhancers, cholinergic mechanisms, and neuroplasticity.",
            biome: "caldera",
            landmark: "✦",
            concepts: ["choline", "l-theanine", "bdnf"],
            connections: ["sleep-circadian"],
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.world.regions.length).toBe(2);
      expect(res.world.seed).toBe(8888);

      const grid = generateAsciiWorld(res.world, { width: 100, height: 50 });
      expect(grid.regionCenters.has("sleep-circadian")).toBe(true);
      expect(grid.regionCenters.has("nootropics")).toBe(true);
    });
  });

  describe("REST Endpoints for ASCII Worlds", () => {
    it("GET /api/maps/ascii/list returns all available worlds", async () => {
      const req = new Request("http://localhost:3000/api/maps/ascii/list");
      const res = await app.fetch(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.worlds)).toBe(true);
      expect(data.worlds.length).toBeGreaterThanOrEqual(3);
    });

    it("GET /api/maps/ascii/:worldId returns world spec and optional grid", async () => {
      const req = new Request("http://localhost:3000/api/maps/ascii/neural-networks?grid=true");
      const res = await app.fetch(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.world.id).toBe("neural-networks");
      expect(data.grid.width).toBe(120);
      expect(data.grid.height).toBe(60);
    });

    it("POST /api/maps/ascii registers a custom world spec", async () => {
      const payload = {
        id: "crypto-economics",
        title: "Cryptoeconomics",
        subject: "Game Theory & Consensus",
        seed: 34567,
        regions: [
          {
            id: "proof-of-work",
            label: "Proof of Work",
            summary: "Nakamoto consensus and thermodynamic security.",
            biome: "mountains",
            landmark: "⛏",
            concepts: ["hash-rate", "difficulty-adjustment"],
            connections: [],
          },
        ],
      };

      const req = new Request("http://localhost:3000/api/maps/ascii", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.world.id).toBe("crypto-economics");

      // Verify it can now be retrieved
      const getReq = new Request("http://localhost:3000/api/maps/ascii/crypto-economics");
      const getRes = await app.fetch(getReq);
      expect(getRes.status).toBe(200);
    });
  });
});
