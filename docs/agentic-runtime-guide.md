# PolyDocks V2 Agentic Runtime Operational Guide

> **Runtime Target:** `agent-home/`, `server/system/`, `server/services/`, and `bin/polydocks`  
> **Philosophy:** *The agent is the operator; the Dock is the single control surface; everything is a capability behind one typed contract.*

---

## 1. Architectural Overview

PolyDocks V2 elevates the runtime from an ephemeral chat assistant to an autonomous workspace operator backed by a persistent filesystem, durable memory, and asynchronous task execution:

```text
agent-home/
├── AGENTS.md               # Runtime operational guidelines and security contracts
├── USER.md                 # User profile, learning goals, and personalization
├── MEMORY.md               # Durable, cross-session curated memory entries
├── memory/                 # Episodic daily append-only logs (YYYY-MM-DD.md)
├── sessions/               # JSONL event streams per session (<session-id>.jsonl)
├── artifacts/              # Agent-synthesized reports, code deliverables, and summaries
└── plugins/                # Workspace plugins, manifests, and sandboxed guest components
```

### Core Architecture Pillars

1. **Durable Two-Tier Memory:**
   - **Tier 1 (Curated Long-Term):** `MEMORY.md` preserves high-priority rules, user preferences, and domain insights across restarts.
   - **Tier 2 (Episodic Daily Logs):** `memory/YYYY-MM-DD.md` logs chronological interactions with timestamps and tags.
   - **Keyword-Scored Retrieval:** Relevance ranking with token budget clamping prevents LLM context saturation.

2. **Session Isolation & Background Tasks:**
   - Sessions are scoped to specific workspaces with dedicated JSONL event transcripts.
   - Background tasks run asynchronously via `TaskExecutionEngine`, reporting incremental progress to SQLite and persisting events without blocking concurrent sessions.
   - Auto-recovery marks orphaned `running` tasks as `interrupted` upon server reboot.

3. **Secure Filesystem Operator:**
   - Path confinement enforces strict boundaries: operations attempting to escape `agent-home/` via `../`, encoded characters, or symlinks trigger immediate security exceptions.
   - Atomic file writes and surgical targeted replacements (`editFileSafe`) guarantee data integrity.

4. **Container Isolation & Security Hardening:**
   - Docker Compose provisions a named persistent volume `agent-home-data` mounted at `/app/agent-home`.
   - Least-privilege execution runs under unprivileged `USER bun` (UID 1000).
   - Strict resource constraints (2GB RAM, 2 CPUs, 100 PIDs) and local loopback binding (`127.0.0.1:3000:3000`) block breakout vectors.

---

## 2. Command Line Interface (`polydocks`)

The `polydocks` CLI provides headless parity and developer operations for the agent runtime.

### Runtime Status
```bash
# Human-readable table (SQLite WAL, model config, task counts)
bun bin/polydocks status

# Structured JSON format for programmatic tooling
bun bin/polydocks status --json
```

### Session Management
```bash
# List all active and archived sessions
bun bin/polydocks sessions
bun bin/polydocks sessions --json

# Resume and stream session transcript
bun bin/polydocks sessions resume <session-id>
```

### Background Task Monitoring
```bash
# List background tasks
bun bin/polydocks tasks

# Filter tasks by status (queued, running, completed, failed, cancelled)
bun bin/polydocks tasks --status running
```

### Plugin Catalog & Operations
```bash
# List mounted and available plugins
bun bin/polydocks plugins
bun bin/polydocks plugins --json

# Inspect plugin manifest and permissions
bun bin/polydocks plugins inspect <plugin-id>

# Install plugin into active workspace
bun bin/polydocks plugins install <plugin-id>
```

### Headless Agent Execution
```bash
# Run an agent instruction directly from CLI
bun bin/polydocks agent run "Research quantum teleportation and write summary to artifacts"

# Output structured result and event stream as JSON
bun bin/polydocks agent run "Analyze Stoic dichotomy of control" --json
```

---

## 3. Developer Verification & Test Suites

PolyDocks enforces a 100% green quality gate (`bun run check`) before every commit:

```bash
# Run full quality gate (typecheck + oxlint + all test suites + production build)
bun run check

# Run End-to-End Agentic Runtime integration benchmark (5 stages)
bun test tests/agentic-runtime-e2e.test.ts

# Verify Docker container isolation and resource limit constraints
bun test tests/docker-isolation.test.ts

# Validate Docker Compose configuration
docker compose config
```

### Benchmark Stages in `tests/agentic-runtime-e2e.test.ts`

- **Stage 1:** Proves durable memory survival in `MEMORY.md` across simulated server teardown and reboot.
- **Stage 2:** Proves concurrent multi-workspace session isolation and asynchronous background task completion.
- **Stage 3:** Proves safe deliverable generation, exact surgical targeted edits, and path traversal rejection.
- **Stage 4:** Proves `polydocks` CLI operations and structured JSON output.
- **Stage 5:** Proves REST endpoint health (`/api/health`, `/api/workspaces`) and that retired knowledge-map routes stay gone.
