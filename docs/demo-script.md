# Demo Video Script: Request → Creation → Payoff

Target runtime: 2–3 minutes. One flawless end-to-end flow, no tour of
every plugin. Record at 1920×1080 @30fps, default dark theme, clean
workspace (`docker compose up` from a fresh checkout). The narrator
reads the pitch; Poly does everything else.

## 30-second pitch (intro + outro voiceover)

> Most AI agents are limited by the tools they're given. We built
> PolyDocks around a different idea: what if an agent could build the
> tools it needs? You give Poly a task. It can create a new plugin, run
> it in an isolated environment, and bring it directly into your
> workspace. Then it uses that tool to get the job done. That's
> PolyDocks: software that adapts to your work.

## Setup checklist (before pressing record)

- [ ] Fresh `docker compose up`; no leftover tools in the dock.
- [ ] `MODEL_API_KEY` + `TINYFISH_API_KEY` set (research must be live).
- [ ] Atrium worker running if available; if not, the reader fallback +
      "Open in new tab" card is the honest path — do not fake Chromium.
- [ ] Browser console open on a second monitor: zero unhandled errors
      during the take or it doesn't count.
- [ ] Quiet room; voice mode tested once ("It's listening" state visible).

## Act 1 — The Request (0:00–0:35)

On screen: home screen, empty dock, orb idle. Narrator (voice or typed
composer — typed is more reliable on camera):

> "Build me a breathing exercise plugin: a circle that expands and
> contracts on a 4-4-4-4 box breathing cycle with start/pause, a round
> counter, and a calm dark design. Call it Box Breathing."

Expected: Poly acknowledges, thought stream starts rising ("Searching
existing capabilities…"). Cut nothing — the thinking IS the demo.

Fallback: if the first model call stalls >30s, stop, keep the stall in
a blooper file, re-record. Never edit around a stall.

## Act 2 — The Creation (0:35–1:40)

On screen, in order (do not skip ahead — let each land):

1. **Capability check.** Thoughts show Poly listing dock/tools and
   finding no breathing plugin (real missing capability, not staged).
2. **Code generation.** `plugin.created` mounts Box Breathing in the
   dock live — no reload, no refresh (#360). Status line reads
   `Mounted "Box Breathing" in the dock.`
3. **Research beat (parallel proof).** While the plugin builds, second
   prompt: "Research box-breathing protocols and save the best sources."
   Sources feed fills live with site logos; click one — it opens in the
   Browser surface (#350, #352).
4. **Notes beat.** "Append the 4-4-4-4 pattern to a note." Note
   autosaves beside the browser (#351).

Expected: every mount/update arrives over the live stream. If anything
requires a manual reload, the take is invalid — file a bug, don't edit
around it.

## Act 3 — The Payoff (1:40–2:30)

On screen: Poly opens Box Breathing and runs it.

1. Press start in the plugin: the circle expands/contracts on cycle.
2. Switch to the Browser tab and back: the timer kept counting
   (host-owned lifecycle — state survives tab switches).
3. Sources feed + note remain populated after the tab switches.

Closing shot: home screen with the personalized theme, the research
feed, and Box Breathing live in the dock. Narrator reads the pitch
again over it, then the tagline card:

> Tell Poly what you need. It builds the tools to do it.

## Do-not-show list

- Bitcoin price viewer or any plugin id that may not be installed
  (blank-void fallback is a failed take, #319).
- Raw Chromium claims when the worker is down — show the reader.
- Multi-tenancy, marketplace, or collaboration — not built yet.
- Console errors, loading spinners that never resolve, edited stalls.
