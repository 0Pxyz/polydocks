# Plugin UI Kit v2 — inventory (Phase 1) and implementation (Phase 2)

## Phase 1 — what existed

- **Runtime**: `server/plugin-kit/entry.ts` bundles React + react-dom +
  17 shadcn components (`src/components/ui/*`) as `window.__polymaxKit`
  (`kit.bundle.js`, 700KB). Built by `scripts/build-plugin-kit.ts`,
  inlined into every React plugin srcdoc. `manifest.json` inventories exports.
- **Guest pipeline**: `server/workspace/reactKit.ts` — `UI_KIT_FILES`
  allowlist, `rewriteKitImports` (imports → kit globals), `bundleFeatureCode`
  (TSX → JS, JSX-runtime normalization), `compileGuestCss` (per-publish
  Tailwind with vendored tokens). React path also needs `react`,
  `react-dom/client` imports; vanilla path uses `.px-*` classes
  (`server/workspace/features.ts` inlines `tokens.css`).
- **Agent usage**: skill `server/agent/skills/plugins.md` told the agent
  "kit first" with a loose component list; tools `create_plugin` /
  `modify_plugin` / `publish_plugin` enforce `validateSlop` (strict for
  agents). No queryable catalog existed — the agent re-read prompts and
  re-guessed structure per plugin.
- **Validation**: `server/plugins/validate.ts` mounts guest JS in happy-dom
  with the real bundle and renders to string. Hex and slop were
  **warning-only**; only lifecycle violations and render failures blocked.
- **Existing plugins**: feed reader fixture (`gtm_feed_reader.test.ts`)
  mixes kit (`Button`, `Input`, `Tabs`, `Skeleton`) with hand-built rows
  (`rounded-xl border border-border bg-card`, `Badge` per row, two buttons
  per row). That is the norm: kit atoms, custom layout per plugin.

## Gaps found

1. No layout/typography/data primitives (Stack, Heading, ListRow, …) —
   every plugin reinvented spacing and rows.
2. No screen patterns — search+list, metrics, forms rebuilt each time.
3. No agent-queryable index — choosing meant re-reading the skill.
4. Gate too soft — raw `<button>/<input>`, hex and inline `style=` passed
   with warnings, so generated UI drifted off-theme.
5. No gallery — no visual QA or living documentation.
6. No version — breaking changes had no contract.

## Phase 2 — what shipped (kit v2.0.0)

- `server/plugin-kit/kit/primitives.tsx` — Level 1 (layout, text,
  actions, inputs, data, feedback). Tokens only, no fixed values.
- `server/plugin-kit/kit/patterns.tsx` — 9 screen patterns with slots.
- `server/plugin-kit/catalog.ts` — `KIT_VERSION`, generated-style index
  (`name`, `when`, `category`) + detail cards + rules.
- `server/agent/tools/ui_catalog.ts` — index or fichas, on full + minimal.
- `server/plugins/kitValidator.ts` — rejects raw elements, hex, inline
  style, kit-free code with a fixable report (retry ≤ 2).
- `server/plugins/validate.ts` + `slop.ts` (strict) enforce the gate;
  lifecycle violations still checked first so their error stays exact.
- `server/plugin-kit/examples.ts` — 5 canonical references
  (timer, feed, form, metrics, notes), all passing gate + render.
- `server/plugins/first-party/kitGallery.ts` — internal QA gallery,
  registered on boot, theme-driven.
- Skill `plugins.md` rewritten kit-first within the 600-token budget.
- `scripts/build-plugin-kit.ts` + `manifest.json` carry `version: 2.0.0`;
  existing plugins keep working (additive exports, no renames).

## Not done (explicitly deferred)

- Level 2/3 (Chart, Calendar, Kanban, MediaPlayer, Map, Terminal…) —
  no agent demand observed yet; catalog reserves the categories.
- Screenshot/overflow pixel QA — render validation only; Playwright
  stays out of `bun test`.
- Feed/Bitcoin/timer migration — examples prove the kit; migrating
  shipped plugins is tracked in #291.

## v2.1 (follow-up, #291)

- Level 2 essentials shipped: `AreaChart`, `Bars`, `Countdown` +
  `useCountdown`, `DateField`, `MarkdownView`, `CodeBlock`.
- Shipped plugins migrated: bitcoin (Metric + SegmentedControl +
  InlineMessage + AreaChart, token up/down), pomodoro (React +
  Countdown + history ListRow), gtm feed fixture (ReaderFeed +
  ListRow + SegmentedControl). Guest code moved out of the registry
  into `server/plugins/seeds/*.code.ts`; the registry owns manifest
  + upsert only, with one-shot migration for existing checkouts.
  Light mode stays deferred: tokens are dark-only by design, so
  "claro/escuro" today means the 4 dark themes.
- QA: per-theme WCAG AA contrast test
  (`server/plugin-kit/tokens.contrast.test.ts`) — void/cyber/amber/
  amethyst all pass (body 17.8–18.3, muted 6.1–6.6, button 7.5–16.9).
- Button fix: the class extractor dropped every quoted string after an
  apostrophe (`[class*='size-']`), so `kit.css` had no button classes and
  shadcn Buttons rendered as raw HTML; the build template also lacked
  the default theme (no `--spacing`/`--text-*`/`--animate-*`). Both
  fixed with a shared `extractClassCandidates` + `@import
  "tailwindcss/theme"`; `kit.css` 11.7KB → 40KB with regression tests.
