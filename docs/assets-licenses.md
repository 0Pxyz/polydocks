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
| `lucide-react` | ISC | System and interface navigation icons | https://github.com/lucide-icons/lucide |
| `mulberry32` (PRNG) | Public Domain / Custom | Seeded 32-bit PRNG implemented in `src/lib/mapgen/prng.ts` | Self-contained implementation |
