# Modal Sandboxes — agent code execution

One workspace ↔ one sandbox. PolyDocks owns the agent, the workspace and
permissions; Modal owns isolated compute and lifecycle. The main agent loop
never runs inside Modal and no agent lives in the sandbox.

## Setup

The server authenticates as a Modal client with either:

- `~/.modal.toml` (created by `modal setup` / `python -m modal setup`), or
- env vars `MODAL_TOKEN_ID` + `MODAL_TOKEN_SECRET` (same names the JS SDK
  reads; env wins over the toml profile).

Without credentials the provider reports `modal_not_configured` and sandbox
tools fail closed with a setup hint. Everything else keeps working;
conversational turns never create sandboxes.

Reference: https://modal.com/docs/examples/modal-vibe (implementation
reference only — product, workspace and policy stay in PolyDocks).

## How it works

- Identity: `workspace_sandboxes` maps each workspace to `{sandboxId,
  volume, status, previewUrl}`. Sandboxes and volumes are disposable; the
  row is only a pointer. Product data stays in workspace tables.
- Naming: sandboxes `ws-<workspace>`, volumes `polydocks-ws-<workspace>`
  (sanitized, Modal-safe). Tags `{workspace, managed-by: polydocks}`.
- Reuse: `fromId(stored)` when running; named create otherwise. Name
  conflicts (slow termination) adopt the running sandbox by tag, then retry
  briefly — never orphan suffixed duplicates.
- Persistence: the workspace **volume is mounted at `/repo`** (the workdir),
  so every file the agent writes survives sandbox replacement. PolyDocks
  workspace files (notes, plugins, sources) are a separate store; the
  sandbox filesystem is disposable compute, not the source of truth.
- Image: `node:22-slim` from the public registry (no bake step on the
  request path). A pinned/named image build is a follow-up, not required.
- Servers: `encryptedPorts: [3000, 5173, 8080]` declared at create;
  `sandbox.serve` starts the command detached, waits for the TCP port, then
  resolves the TLS tunnel URL via `tunnels()`. Preview URLs are public but
  unguessable; the agent reports exactly the returned URL.
- Limits: cpu 0.5, 512 MiB, 30 min lifetime, 10 min idle timeout, 120 s
  default exec timeout, 32 KB output cap, 512 KB write cap. Sandboxes bill
  while running — terminate when done (`sandbox_terminate` keeps the volume).

## Policy

Same rule as plugin lifecycle (#162): mutating capabilities (`exec`,
`write_file`, `serve`, `terminate`) require `{ userApproved: true }` for
actor=agent under `INSTALL_POLICY=ask` (auto proceeds, never denies).
Reads (`read_file`, `list_files`, `logs`, `status`) are free. No secrets are
ever accepted or injected: exec env comes only from explicit non-secret
args, and inputs/outputs are redacted in the audit trail. Network is open
by default (npm install needs it); locking it down is a follow-up.

## Agent surface

Capabilities `sandbox.*` on the capability bus (policy + `executions`
audit), thin full-catalog tools (`sandbox_exec`, `sandbox_write_file`,
`sandbox_read_file`, `sandbox_list_files`, `sandbox_serve`, `sandbox_logs`,
`sandbox_status`, `sandbox_terminate`), the `sandbox` skill (selector:
run/execute/serve/preview asks), friendly tool.start labels, and a
`sandbox.preview` SSE event (mapped to the reader surface like
`browser.open`). The sandbox is created/reused only when execution is
actually required.

## Local development vs Modal

Local Docker is the dev-time relation at the **image** level (same
container semantics: workdir `/repo`, node runtime, port serving), not a
provider abstraction — there is exactly one execution provider (Modal).
Without credentials the app boots and runs; sandbox tools fail closed.

## Tests

`tests/issue-166-sandbox.test.ts`: pure unit tests always run (path guard,
naming, approval fail-closed, no-sandbox conversations). Live tests run
against real Modal sandboxes when configured (otherwise skipped): the full
vertical slice (write → exec → nonzero-exit receipt → serve → fetch preview
URL → logs/status → cross-workspace isolation → terminate → recreate →
files survive).

## Relation to #156 / #157

#156 (Terminal plugin on Modal) and #157 (verify generated React in a
sandbox) are the tactical consumers of this provider: same sandbox identity,
same approval rule, same receipt pattern. They are not duplicated here.
