# Design System

Polymax follows a disciplined, dark-only design system anchored in the Agentic Dock.

## Principles

The dock is the primary control surface. Views expand into the viewport rather than spawning floating windows or modal clutter.

All interface work must adhere to the design rules in [Design Slop](design-slop.md). Review this checklist before designing or modifying UI components.

## Tokens

Theme tokens are defined in `src/styles/tokens.css` and mapped through Tailwind variables:

- Background: `var(--bg-void)` (#0A0A0C default)
- Surface: `var(--bg-surface)` (#12151D default)
- Accent: `var(--accent-lime)` (#C8FF57 default)
- Text Main: `var(--text-main)` (#F1F3F9)
- Text Muted: `var(--text-muted)` (#8B95A8)

## Typography

Typography relies on clean, modern sans-serif:

- Body and Titles: Inter Variable (`font-sans`), normal tracking
- Code and Metrics: Geist Mono Variable (`font-mono`)
- No display serifs or artificial negative tracking

## Motion

Transitions use shared physics from `src/lib/motion.ts`:

- Spring soft: `{ type: "spring", stiffness: 350, damping: 30 }`
- Standard durations: 150ms to 200ms
- Reduced motion: instant swaps with opacity transitions
