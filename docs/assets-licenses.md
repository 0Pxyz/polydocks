# Assets and Third-Party Licenses Log

## Map Art & Cartography Policy
Polymax enforces an **honest, original, procedural-first cartography engine**.
Per project principles, external copyrighted cartography assets (such as user maps or asset packs from Inkarnate) are **strictly forbidden**.

### Inkarnate API & Platform Investigation
- **Status:** Verified.
- **Finding:** Inkarnate does **not** provide any public developer API, SDK, or programmatic generation endpoints. Their platform Terms of Service explicitly prohibit web scraping, automated generation, crawling, and AI training on their materials.
- **Resolution:** Polymax does not use, scrape, or reverse-engineer any Inkarnate assets or tools. Instead, Polymax implements its own **100% procedural cartography engine** in TypeScript and HTML5 Canvas using seeded mathematical Voronoi cells (Lloyd relaxation), Simplex noise heightmaps, and procedural SVG vector sprites.

---

## Third-Party Libraries & Licenses

| Library | License | Usage | URL |
| :--- | :--- | :--- | :--- |
| `d3-delaunay` | ISC | Voronoi tessellation & Lloyd relaxation for procedural territory cells | https://github.com/d3/d3-delaunay |
| `simplex-noise` | MIT | Deterministic heightfield generation & coastline perturbation | https://github.com/jwagner/simplex-noise.js |
| `lucide-react` | ISC | Legacy system and interface navigation icons (retained only for shadcn/ui primitives) | https://github.com/lucide-icons/lucide |
| `phosphor-icons` (`@phosphor-icons/react`, `@phosphor-icons/core`) | MIT | Unified dock iconography family, dynamic dock experiences, and agent icon catalog | https://github.com/phosphor-icons/homepage |
| `Azgaar/Fantasy-Map-Generator` | MIT | Pinned `v1.104.0` (commit `69894e77d33d9cbb281ff946d32049d5a49479b1`). Source of illustrated world map presets (Gloom, Ancient, Clean, Monochrome) and territory topology manifests (`pack.states`, `pack.burgs`). Generated maps are free to use under MIT. | https://github.com/Azgaar/Fantasy-Map-Generator |
| `sharp` | Apache 2.0 | High-performance raster image processing and WebP conversion | https://github.com/lovell/sharp |
| `mulberry32` (PRNG) | Public Domain / Custom | Seeded 32-bit PRNG implemented in `src/lib/mapgen/prng.ts` | Self-contained implementation |
