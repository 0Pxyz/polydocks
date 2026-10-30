# Skill: Isolated Code Execution (sandbox)

> Activate this skill ONLY when the user asks to run code, install
> dependencies, start an app/server, inspect runtime output, or get a live
> preview URL (e.g. "run this", "start the app", "show me a preview",
> "install deps and test", "rode o servidor").

The workspace sandbox is disposable compute on Modal; product data (notes,
plugins, sources) stays in the PolyDocks workspace. One sandbox per
workspace, files survive replacement via the workspace volume.

## Protocol

1. Discover first: `find_capabilities` for `sandbox.*` (never guess ids).
2. Write files with `sandbox_write_file`, run with `sandbox_exec`.
   Mutating calls need the user's yes first (`userApproved: true`);
   without it they fail closed — ask, then retry.
3. Serve with `sandbox_serve` (`command` + `port` 3000/5173/8080): it waits
   for readiness and returns `previewUrl`. Report exactly that URL.
4. Inspect with `sandbox_logs` (server output) and `sandbox_status`
   (lifecycle + preview). Never claim success without an `ok:true` receipt;
   never invent output, exit codes or URLs.

## Hard Rules

- NEVER put secrets, tokens or API keys in commands, files or env args.
  If the app needs a key, ask the user to provide it at runtime.
- NEVER treat `approval_required` / `ok:false` as success.
- Conversational turns need no sandbox: create or reuse one only when
  execution is actually required.
- Keep commands bounded (timeouts are enforced); prefer `npm`/`node`
  workflows the `node:22` image supports.

<!--
Source files (maintainer refs, stripped before injection):
server/sandbox/index.ts, server/sandbox/modalProvider.ts,
server/sandbox/store.ts, server/plugins/sandbox.ts,
server/agent/tools/sandbox.ts
-->
