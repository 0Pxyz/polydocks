# Procedural ASCII World Engine (Maps Experiment)

> **Status:** Experimental Prototype  
> **Target:** `src/features/world/ascii/`, `server/routes/maps.ts`, `server/agent/tools/plan_ascii_world.ts`  
> **Tracking Issue:** [#97](https://github.com/0Pxyz/polymax/issues/97)

---

## 1. Vision & Architecture

The **Procedural ASCII World Engine** prototypes an alternative knowledge visualization system for Polymax. Instead of classic React nodes and edges floating on an infinite canvas, the system generates an illustrated, explorable world using ASCII characters, symbols, and typographic terrain patterns.

```
       ~~≈≈≈≈~~
   ┌─ ◬ ──────────────┐       ═════╗
   │  PERCEPTRONS     │            ║
   └──────────────────┘            ║
          ·                        ▼
          ·             ┌─ ▲ ──────────────┐
          ·             │  BACKPROPAGATION │
                        └──────────────────┘
```

### Core Architecture: Strict Separation of Concerns

```mermaid
flowchart LR
    A["Agent Intent / Subject"] --> B["AsciiWorldSpec (Semantic Data)"]
    B --> C["Procedural Engine (Mulberry32 + Noise)"]
    C --> D["AsciiGrid (140x70 Matrix)"]
    D --> E["Single Canvas Renderer (60 FPS + Culling)"]
    E --> F["Region Inspector & City Workspace"]
```

1. **Semantic Layer (`AsciiWorldSpec`):** Completely renderer-independent. The agent or human defines what regions exist, their concepts, connections, landmarks, and progression state.
2. **Procedural Layer (`generateAsciiWorld`):** Uses Mulberry32 deterministic PRNG and harmonic value noise to sculpt terrain, coastlines, biome territories, roads between connected regions, and settlement plaques.
3. **Renderer Layer (`AsciiWorldCanvas`):** Hardware-accelerated HTML5 2D Canvas. Evaluates character grids at 60 FPS, with smooth pointer pan/zoom, viewport culling, and instant region hit-testing.
4. **Interaction Layer (`AsciiRegionInspector`):** Floating game-like HUD surfacing region concepts, summaries, road quick-jumps, and deep-linking into the persistent city workspace.

---

## 2. Canonical Test Worlds

Three distinct knowledge domains have been modeled to prove domain agnosticism:

| World | Seed | Biomes & Landmarks | Key Regions | Prerequisite Roads |
| :--- | :--- | :--- | :--- | :--- |
| **Neural Networks** | `42817` | Plains (`◬`), Mountains (`▲`), Forest (`◈`), Caldera (`✦`), Desert (`⚙`) | Perceptrons, Backpropagation, CNNs, Transformers, Optimization | Perceptrons ↔ Backprop ↔ Optimization & Transformers |
| **Stoicism** | `19840` | Mountains (`⚖`), Plains (`🏛`), Forest (`☸`), Desert (`⌛`), Caldera (`✦`) | Dichotomy of Control, Cardinal Virtues, Amor Fati, Memento Mori, Logos | Control ↔ Virtues ↔ Amor Fati ↔ Memento Mori ↔ Logos |
| **Poker Strategy** | `77713` | Plains (`♠`), Mountains (`♦`), Forest (`♣`), Caldera (`♥`), Desert (`👑`) | Preflop Ranges, Pot Odds, Flop C-Betting, GTO Solvers, River Endgame | Preflop ↔ Pot Odds ↔ C-Betting ↔ GTO & River |

---

## 3. Rendering Strategy & Performance Characteristics

### Why Canvas instead of DOM Nodes?
- **Zero DOM Bloat:** A 140x70 character grid comprises 9,800 cells. Creating 9,800 React components or DOM elements introduces layout thrashing and garbage collection spikes. The canvas renderer draws the entire scene in a single batch via `ctx.fillText`.
- **Viewport Culling:** Only cells intersecting the active camera viewport `(-camera.x, -camera.y)` are processed and rendered.
- **Sub-pixel Smoothness:** Hardware-accelerated transforms (`ctx.scale`, `ctx.translate`) allow smooth panning and zooming (40% to 350%) with 60 FPS frame rates.
- **Coordinate Hit-Testing:** Screen pointer coordinates `(clientX, clientY)` are inverted to grid coordinates `(col, row)` in O(1) time without querying DOM nodes.

---

## 4. Agent Integration: `plan_ascii_world`

The agent is responsible for **semantic domain architecture**, never manual ASCII drawing:

```typescript
const result = await plan_ascii_world.execute({
  subject: "Quantum Computing",
  regions: [
    {
      id: "qubits",
      label: "Qubits & Superposition",
      summary: "State vectors, Bloch spheres, and Hadamard transformations.",
      biome: "caldera",
      landmark: "⚛",
      concepts: ["bloch-sphere", "hadamard-gate", "coherence-time"],
      connections: ["entanglement"],
    },
  ],
});
```

The resulting `AsciiWorldSpec` can be persisted via `POST /api/maps/ascii` and rendered instantly without LLM latency.

---

## 5. Limitations & Future Roadmap

1. **Infinite Chunk Streaming:** The current prototype renders a fixed 140x70 grid. The underlying deterministic noise function `terrainNoise(x, y, seed)` is already continuous and can be tiled into dynamic chunks `(chunkX, chunkY)` loaded on demand during infinite panning.
2. **Dynamic Biome Palettes:** Currently tied to dark-mode design tokens (`#06080e`, `#C8FF57`, sky blue, emerald, amber). Could dynamically adapt to the user's active custom theme palette.
3. **Animated Glyphs:** Water waves (`~` / `≈`) and caldera fire (`*` / `✦`) could cycle character phases over time for a living ASCII world effect.
