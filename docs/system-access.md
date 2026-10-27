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
| **Storage Root** | Ephemeral `/workspace/<city-id>/` | Granted host folder (`-v ~/Knowledge:/workspace`) |
| **Command Execution** | **Strictly Disabled** (Zero shell / exec) | Allowlisted commands with explicit human approval |
| **File Access** | Scoped strictly to the active city folder | User-granted directories with typed filesystem grants |
| **Audit Log** | In-memory / SQLite audit trail | Appended to `workspace/.audit.log` |

---

## 2. City Filesystem Contract (POSIX First)

Knowledge is never locked in proprietary databases. Each city is a standard directory tree:

```text
workspace/<city-slug>/
├── city.json              # City descriptor { id, title, region, level, tags }
├── workspace.json         # Active layout, pinned dock plugins, study state
├── feed.json              # Curated TinyFish discovery items (papers, videos, news)
├── notes/                 # User and agent notes in Markdown (*.md)
│   ├── overview.md
│   └── key-insights.md
├── sources/               # Raw metadata & parsed text of external sources
│   └── tinyfish_fetch_01.json
├── files/                 # PDFs, assets, and diagrams
└── tabs/                  # Synthesized dynamic dock micro-apps
    └── flashcards/
        ├── manifest.json  # Plugin descriptor { id, title, icon, scope }
        └── index.html     # Self-contained executable guest UI
```

---

## 3. Path Traversal & Symlink Guard

All file access within `server/workspace/` is mediated through strict validation:

```typescript
import path from "node:path";
import fs from "node:fs/promises";

export async function resolveSafeCityPath(cityId: string, relativePath: string): Promise<string> {
  const cityRoot = path.resolve(process.cwd(), "workspace", cityId);
  const targetPath = path.resolve(cityRoot, relativePath);

  // Guard against path traversal (../)
  if (!targetPath.startsWith(cityRoot)) {
    throw new Error(`Security Violation: Path traversal detected outside ${cityId}`);
  }

  // Resolve symlinks and verify the real physical path stays within cityRoot
  try {
    const realRoot = await fs.realpath(cityRoot);
    const realTarget = await fs.realpath(targetPath);
    if (!realTarget.startsWith(realRoot)) {
      throw new Error(`Security Violation: Symlink escape detected`);
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err; // Allow checking paths before creation
  }

  return targetPath;
}
```

---

## 4. Capability Ladder & Human-in-the-Loop Approval

Every agent action is categorized by risk level:

1. **Read Operations (Autonomous):**
   - Reading city notes, sources, feeds, and open tabs.
   - Always auto-permitted within the active city.
2. **Safe Write Operations (Autonomous):**
   - Creating/updating markdown notes inside `notes/`.
   - Synthesizing new dynamic tabs inside `tabs/`.
   - Updating `workspace.json` active dock state.
3. **Destructive Operations (Human Approval Required):**
   - Deleting any tab or note file (`delete_tab`, `delete_file`).
   - The loop pauses, emits an SSE approval request, and resumes only upon explicit user confirmation.
4. **Out-of-Sandbox Operations (Forbidden):**
   - Writing outside the active city folder.
   - Spawning arbitrary shell processes in hosted mode.

---

## 5. Architectural Reference: Lessons from Maestri & T3 Code

*Documenting research from reference projects as mandated by `AGENTS.md` §4c:*

### Maestri (Evercraft Labs v0.28.1 bundle analysis)
- **Persisted Workspace State:** Maestri persists spatial canvas nodes into layout files. Polymax applies this to the Dock: the active dock plugins, open tabs, and reading state persist in `workspace.json`.
- **Guest Runtime:** Maestri runs webviews with per-partition sessions. Polymax runs dynamic tabs in isolated `iframe srcdoc` containers communicating solely via a typed `postMessage` bridge (`window.polymax`).
- **CLI and Headless Parity:** Maestri includes a bundled CLI (`maestri floor create`). Polymax provides the MCP Server (`/api/mcp`) and `llms.txt` so external CLI tools and agents can operate directly on cities.
