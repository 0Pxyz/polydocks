# World Cartography Specification (Maps v2)

## 1. Non-Negotiable Sourcing Rules
Polymax strictly abides by copyright and terms of service:
- **No Third-Party Scraping or Proprietary Assets:** Scraping, automating, reverse-engineering, or using maps from Inkarnate or unauthorized services is strictly prohibited. Inkarnate provides no public API and forbids automated retrieval.
- **Permitted Sources:**
  1. **Azgaar's Fantasy Map Generator (FMG):** Open source under the MIT License ([GitHub](https://github.com/Azgaar/Fantasy-Map-Generator)). Generated maps and topology exports are free to use. Pinned commit: `69894e77d33d9cbb281ff946d32049d5a49479b1` (`v1.104.0`).
  2. **User-Uploaded Maps (Phase 2):** Raster images supplied locally by the user. Stored only in local data directory (`DATA_DIR/maps/<id>/`), never committed to git.
  3. **Polymax Native Art & Shaders:** Original procedural textures, vignettes, and shaders built into the app.

---

## 2. Azgaar Fantasy Map Generator Architecture & Verified Globals
When inspecting and driving Azgaar's Fantasy Map Generator (FMG):
- **Topology Data Model (`pack` object in FMG runtime):**
  - `pack.states`: Array of political entities/territories. Each entry contains:
    - `i`: Numerical identifier
    - `name`: State/province name (e.g., "Aethelgard", "Vanguard Marches")
    - `pole`: `[x, y]` centroid / center of mass coordinates
    - `color`: Suggested accent/fill color
    - `cells`: Number of Voronoi territory cells
  - `pack.burgs`: Array of settlements/cities. Each entry contains:
    - `i`: Burg identifier
    - `name`: Settlement name
    - `x`, `y`: Exact pixel coordinates on the map grid
    - `state`: Foreign key to `pack.states[i]`
    - `population`: Settlement weight / importance score
    - `capital`: Boolean indicating primary administrative hub
  - Canvas Graph Bounds: `graphWidth` and `graphHeight` (standard 1920x1080 or 3840x2160).
- **Layer Isolation:**
  - Before exporting raster imagery, all text and icon layers (`#labels`, `#burgLabels`, `#burgIcons`, `#icons`) must be toggled off.
  - Polymax renders its own vector markers, collision-culled labels, active glow states, and interactive hover tooltips in an accessible HTML/Canvas overlay layer.
- **Coordinate Normalization:**
  - All coordinates are normalized to the `[0, 1]` unit space:
    $$x_{norm} = \frac{x}{width}, \quad y_{norm} = \frac{y}{height}$$
  - This ensures coordinates scale dynamically across screen aspect ratios, responsive viewports, and native device zoom levels.

---

## 3. Bundled Demo Map Presets
Polymax ships with 4 distinct offline style presets:
1. **Gloom (`gloom`):** Dark fantasy, charcoal abyss, muted violet borders, and glowing cyan coastlines.
2. **Ancient Parchment (`ancient`):** Weathered sepia parchment, calligraphic relief contours, and warm amber accents.
3. **Clean Atlas (`atlas`):** Modern cartographic navy blue ocean, crisp slate continents, and minimal white contours.
4. **Monochrome Slate (`monochrome`):** High-contrast graphite terrain, obsidian deep waters, and neon lime contrast rings.

Each preset is bundled in `public/maps/<id>/`:
- `map.webp`: 2048x1152 high-resolution illustrated raster map.
- `thumb.webp`: 400x225 low-resolution blurred thumbnail for progressive blur-up rendering.
- `map.json`: Typed `MapSource` manifest containing normalized regions and burg sites.

---

## 4. Manual Fallback Workflow (Offline/Air-gapped)
If automated browser generation is unavailable in a constrained environment:
1. Open https://azgaar.github.io/Fantasy-Map-Generator in a modern browser.
2. Under **Layers**, turn off **Labels**, **Burg Icons**, and **Burg Names**.
3. Under **Style**, choose the desired preset (e.g. "Gloom", "Ancient", "Default", or "Monochrome").
4. Open the Developer Console (`F12`), extract the JSON topology:
   ```javascript
   const w = graphWidth, h = graphHeight;
   const regions = pack.states.filter(s => s.i > 0).map(s => ({
     id: `reg-${s.i}`,
     name: s.name,
     color: s.color,
     cx: Number((s.pole[0] / w).toFixed(4)),
     cy: Number((s.pole[1] / h).toFixed(4))
   }));
   const sites = pack.burgs.filter(b => b.i > 0).map(b => ({
     id: `site-${b.i}`,
     name: b.name,
     x: Number((b.x / w).toFixed(4)),
     y: Number((b.y / h).toFixed(4)),
     regionId: `reg-${b.state}`,
     importance: b.capital ? 1 : 0.5
   }));
   copy(JSON.stringify({ regions, sites }, null, 2));
   ```
5. Click **Save -> PNG** at 2x resolution. Save file into `assets/maps-src/<style>/map.png` and paste the JSON into `assets/maps-src/<style>/topology.json`.
6. Run `bun run scripts/build-demo-maps.ts` to convert images to WebP and assemble the `public/maps/` distribution.
