# Procedural Particle World Engine

An experimental alternative renderer exploring whether procedural particle worlds can make Knowledge Cities feel like living, explorable realms rather than static node graphs.

The current Maps implementation remains intact and functional. Users can switch between Illustrated, ASCII, and Particle engines using the mode toggle on the style picker.

## Visual Approach and Design Principles

The particle world engine generates an intentional, dark, restrained cartographic space. Particles do not float in an arbitrary cloud. Instead, they form distinct islands and clusters representing semantic knowledge territories.

Each territory features:

A dense central cluster with harmonic boundary falloff, giving the territory an organic shape rather than a sterile geometric circle.

A landmark constellation anchored at the territory center, featuring a primary beacon particle, satellite orbit motes, and a semantic glyph.

Dashed contour hulls outlining the perimeter in negative space, demarcating territory borders without overwhelming borders.

Cubic bezier conduits tracing relationships between connected regions, along which flow particles drift to communicate knowledge flow.

## Procedural Generation Pipeline

The generation pipeline is pure, deterministic, and seed-driven using a Mulberry32 pseudo-random number generator. Given the same semantic world specification and numeric seed, the engine generates byte-identical particle positions, conduit trajectories, and constellation points.

Generation proceeds in four stages:

1. Territory Placement: Anchors regions using normalized coordinates with a bounded organic jitter.
2. Cluster Synthesis: Distributes particles within each territory using polar power distributions perturbed by harmonic radial frequencies.
3. Conduit Calculation: Derives curved cubic bezier curves between related regions with normal vector bow offsets, populating each route with flowing particles.
4. Negative Space Seeding: Places a sparse field of subtle background motes while enforcing a minimum distance clearance around all territory clusters.

## Knowledge-Aware Canonical Worlds

The engine renders three canonical learning worlds using a shared semantic specification without hardcoded layouts:

Neural Networks: Territory clusters for Perceptrons, Backpropagation, Convolutional Nets, Transformers, and Optimization.

Stoicism: Hellenistic philosophical territories covering Dichotomy of Control, Cardinal Virtues, Amor Fati, Memento Mori, and Universal Logos.

Poker Strategy: Game-theoretic decision spaces for Preflop Ranges, Pot Odds, Equity and Polarization, Board Texture, and Game Theory Optimal play.

## Performance and Architecture

Rendering runs on a single HTML5 2D Canvas surface rather than individual DOM elements or React components.

Batching: Particles are grouped by semantic token color and drawn in batched paths, minimizing canvas state mutations.

Device Pixel Ratio: Canvas dimensions scale with window device pixel ratio, ensuring crisp rendering on high-DPI retina displays.

Interaction: Pan and zoom are calculated smoothly with invariant mouse centering. Hit-testing runs against territory bounding radii rather than thousands of individual particles.

Resource Conservation: When the browser tab is hidden or when the user navigates away, the requestAnimationFrame loop automatically pauses.

Reduced Motion: When prefers-reduced-motion is active, particle drift and orbital rotations are halted, rendering a clean static world.

## Anti-Slop Adherence

The particle renderer adheres strictly to the Polymax design tokens and anti-slop guidelines:

No arbitrary glow shaders, bloom post-processing, or neon clutter.

No decorative connecting lines without semantic backing.

No floating cards or dashboards covering the map; territory information appears only when a user selects a region.

Progressive disclosure via a compact, restrained territory inspector that allows flying directly into the corresponding City Workspace.

## Limitations and Future Exploration

The current prototype relies on Canvas 2D. While Canvas 2D easily maintains 60 FPS across hundreds of particles with sub-millisecond draw calls, scaling to tens of thousands of particles in a planetary-scale map would benefit from a WebGL or WebGPU instanced particle buffer.
