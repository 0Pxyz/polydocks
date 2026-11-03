# PolyDocks at the hackathon

Built for the **Meta Global AI Developer Hackathon** (Indie Track): all
product code in this repo is original work written during the competition
period on a fresh scaffold (see `internal-docs/NEW_WORK.md` for the origin
ledger). No template, no fork, MIT licensed.

## Meta Model API — where it is used

The agent is one loop over the Meta Model API (`server/agent/loop.ts`,
defaults in `server/agent/modelRegistry.ts`): OpenAI-compatible endpoints
at `https://api.meta.ai/v1` with `MODEL_API_KEY`, default model
`muse-spark-1.3` (env-swappable, never hardcoded).

- **Tool calling with zod validation** — ~50 tools (`server/agent/tools/`);
  every call is validated, failures return as tool results so the model
  retries. Details: `docs/meta-model-api.md`.
- **Fast dispatcher + builder split** — a deterministic keyword router
  (`server/agent/orchestrator.ts`) handles dock/skill intents without a
  model call; harder tasks escalate to the model turn that can build
  plugins.
- **Voice** — realtime transcription over `wss /api/voice/realtime`; the
  browser never holds the key, a Bun proxy relays (`server/voice/`).
  Details: `docs/voice-realtime.md`.

Research (web/news/papers + full-text fetch) goes through the TinyFish
APIs server-side (`server/discovery/tinyfish.ts`); the key never reaches
the front end. Details: `docs/tinyfish.md`.

Recorded demo: `docs/media/videos/polydocks-product-walkthrough.mp4`.
Recording script: `internal-docs/demo-script.md`.
