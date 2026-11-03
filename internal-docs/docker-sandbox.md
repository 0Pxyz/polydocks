# Docker Sandbox Smoke Test

One container = one account. Local Docker mirrors the cloud model
(1 sandbox per account) without any new architecture.

## State map (all writes land in two mounts, nothing else)

| Writer | Path in container | Env | Volume |
|---|---|---|---|
| SQLite (`polymax.db` + WAL) | `/app/data` | `DATA_DIR` | named volume |
| agent-home (memory, sessions, artifacts, agent files) | `/app/agent-home` | `AGENT_HOME_DIR` | named volume |

`workspace/` is a one-time import seed only (`migrateWorkspacePluginFiles`
reads it, nothing writes it) — no volume needed. No file had to move to
`/data`: the app already confines writes to `DATA_DIR` + `AGENT_HOME_DIR`.

## Run

```bash
./scripts/smoke-docker.sh
```

What it proves (25 checks): image builds; health reports `mode: local`
with sqlite ok; spoofed `x-polymax-user` still resolves to the fixed owner;
memory record/read-back; plugin create/list via direct API (actor=user);
deterministic fast path for EN commands (`open/close browser`, `list my
dock`, `switch theme to cyber`, 2–65 ms in-container) with `deterministic`
events; PT commands and heavy work fall back to the model loop (no false
fast path); agent endpoint fails closed without a key; plugin + memory
survive container recreate on the same volumes; a second container on fresh
volumes sees nothing from the first (distinct mounts).

With `MODEL_API_KEY` exported in the calling shell, the image also receives
it and the agent steps can run live; without it they assert the
`model_unauthorized` fail-closed behavior.

## Human checklist (browser + mic, not scriptable here)

- [ ] Open the dock in the browser, see the created plugin, close/reopen its tab.
- [ ] Restart check, visually: dock layout after container recreate (step 6).
- [ ] Mic (#177): speak and confirm frame counters advance; stay silent and
  confirm the silent-frame counter (`isSilentPcm16LE` / `MicFrameStats`) fires.
- [ ] Fast path feel: EN dock commands answer instantly, no streaming wait.
