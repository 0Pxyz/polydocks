# System Access & Workspace Isolation Architecture

> **Status:** Security Specification & Capability Ladder  
> **Core Principle:** *Meta decides what to do; the Polymax runtime decides what is permitted to execute.*  
> **Runtime Target:** `server/system/` and `server/workspace/`

---

## 1. Dual Run Modes: Hosted Demo vs Local Machine

Polymax runs under two distinct deployment modes using identical application code:

| Dimension | Hosted Demo (Hackathon Judges / Web) | Local Machine (Power Developer) |
| :--- | :--- | :--- |
| **Binding** | `0.0.0.0:3000` inside Docker container | `127.0.0.1:3000` with per-launch security token |
| **Storage Root** | Ephemeral per-workspace sandbox volume | Granted host folder (`-v ~/Knowledge:/workspace`) |
| **Command Execution** | **Strictly Disabled** (Zero shell / exec) | Allowlisted commands with explicit human approval |
| **File Access** | Scoped strictly to the active workspace | User-granted directories with typed filesystem grants |
| **Audit Log** | In-memory / SQLite audit trail | Appended to `workspace/.audit.log` |

---

## 2. Workspace Data Contract (SQLite First)

Plugin and workspace state lives in SQLite (`DATA_DIR/polymax.db`), not in
loose folders. Agent-home files live on the agent's own disk
(`server/system/filesystem.ts`, path-traversal and symlink-escape guarded);
workspace plugin files live in the `plugin_files` table; research sources
live in the `sources` table keyed by workspace. The `workspace/` directory
holds only ephemeral local data. Server code resolves every filesystem path
through a safe join + realpath check; anything escaping the granted root is
rejected as a security violation.

---

## 3. Path Traversal & Symlink Guard

All file access is mediated through strict validation: resolve the absolute
target, require it to stay under the granted root, resolve symlinks with
realpath and verify the real target stays inside, and reject `..` escapes
and absolute-path injections. Reads are capped (~50KB with offset/limit
pagination); writes outside the granted scope pause for approval and audit.

---

## 4. Capability Ladder & Human-in-the-Loop Approval

Every agent action is categorized by risk level (`server/plugins/policy.ts`):

1. **Read Operations (auto for core/first-party, else grant/approval):**
   - Reading notes, sources, and open plugins.
   - Generated/external plugins need a stored grant or one approval.
2. **Safe Write Operations (auto for core/first-party in the workspace):**
   - Creating/updating plugin code and versions.
   - Otherwise a stored grant or one approval.
3. **Destructive Operations (human approval, every time):**
   - Deleting anything. The loop pauses, emits an SSE approval request, and resumes only on explicit confirmation (15s timeout halts).
4. **External Operations (grant or first-use approval):**
   - Network/service access outside declared permissions.
   - Spawning arbitrary shell processes outside the sandbox allowlist.

---

## 5. Architectural Reference: Lessons from Maestri & T3 Code

*Documenting research from reference projects as mandated by `AGENTS.md` §4c:*

### Maestri (Evercraft Labs v0.28.1 bundle analysis)
- **Persisted Workspace State:** Maestri persists spatial canvas nodes into layout files. Polymax applies this to the Dock: the active dock plugins, open tabs, and reading state persist in `workspace.json`.
- **Guest Runtime:** Maestri runs webviews with per-partition sessions. Polymax runs dynamic tabs in isolated `iframe srcdoc` containers communicating solely via a typed `postMessage` bridge (`window.polymax`).
- **CLI and Headless Parity:** Maestri includes a bundled CLI (`maestri floor create`). Polymax provides the MCP Server (`/api/mcp`) and `llms.txt` so external CLI tools and agents can operate directly on cities.

---

## 6. Container Hardening & Persistent Agent-Home Isolation (Docker)

To prevent container breakouts, denial-of-service, or data loss when deploying via Docker:

1. **Persistent Volume Isolation (`agent-home-data`):**
   - The agent's persistent home directory (`/app/agent-home`) is backed by a dedicated named Docker volume `agent-home-data`.
   - SQLite WAL database and database files are persisted under `./data:/app/data`.
   - Files stored in `agent-home/` (durable memory `MEMORY.md`, task execution logs, sessions, and artifacts) survive `docker compose down` and restart.

2. **Least-Privilege Execution (Non-Root User):**
   - Container processes run strictly under the unprivileged `bun` user (UID 1000).
   - `/app/agent-home` and `/app/data` ownership are chown-configured to `bun:bun` at container build time.

3. **Resource Guardrails & Fork Bomb Mitigation:**
   - **Memory Limit:** Capped at `2048M` (2GB) with a `512M` baseline reservation to prevent out-of-memory host starvation.
   - **CPU Limit:** Capped at `2.0` CPUs.
   - **PID Limit:** Enforced at `pids: 100` to prevent fork bombs or runaway subagent processes.

4. **Network & Socket Isolation:**
   - Default network port published strictly to local loopback (`127.0.0.1:3000:3000`).
   - Host Docker socket (`/var/run/docker.sock`) is never mounted, preventing host container-escape vectors.
   - Secrets (`MODEL_API_KEY`, `TINYFISH_API_KEY`) are passed via environment variables and never committed or written to container disk.
