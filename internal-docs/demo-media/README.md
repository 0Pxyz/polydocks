# Demo media: scripted onboarding tour

Recorded 2026-11-04 against local dev (`docker compose up` equivalent:
front :5173 + API :3000) with Playwright + chromium, viewport 1440x900.

## Video

- `demo-tour-2min.webm` (2:18, VP9) — one continuous **Play demo** run:
  home → customize → research → read → build → remember → handoff.
  Token-free scripted path (typed `DemoAction` lists over the real
  stores/capability bus, fixture feed, no model calls, no network).
  Zero page errors during the recording.

## Screenshots (`shots/`)

Surfaces (tour completed, clean workspace):

- `01-home-dock.png` — home + dock
- `02-command-palette.png` — dock search (`Ctrl+Shift+P`)
- `03-chat-poly.png` — Poly chat (`Ctrl+K`)
- `04-browser.png` — browser feed (real sources)
- `05-notes.png` — notes
- `06-tools.png` — tools (capabilities)
- `07-creations.png` — creations
- `08-library-store.png` — library/store
- `09-settings.png` — settings (themes, dock styles, memory)

Tour frames:

- `10-tour-home.png`, `20-tour-<step>.png` — step entries
- `21-tour-handoff-final.png` — handoff
- `30-frame-<t>s.png` — mid-step frames extracted from the video
  (customize beside-settings, creations, browser/reader)
