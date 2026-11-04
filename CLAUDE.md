# CLAUDE.md

Polydocks is an **Agentic Dock** workspace and knowledge game for the Meta Global AI Developer Hackathon (Indie Track).
The **Dock is the primary UI**: no infinite canvas or fragmented window sprawl. Agents control the dock, synthesize new tabs, explore topics, and interact with the user's workspace.

> **Single Source of Truth:** Refer directly to [AGENTS.md](AGENTS.md) for the full architecture, system rules, and design principles.

---

## Language Rule
- **English Only:** All code, comments, documentation, commit messages, and PRs must strictly be in English.

## Tech Stack
- **Frontend:** Vite, React 19, TypeScript, Tailwind CSS v4, `motion`, `zustand`, `lucide-react`, Radix primitives.
- **Backend:** Bun, Hono, SQLite via `bun:sqlite`. Serves both API and frontend in a single process.
- **AI Agent Loop:** Meta Model API (`https://api.meta.ai/v1`, model: `muse-spark-1.3`), SSE streaming steps.
- **Web Discovery:** TinyFish Search & Fetch APIs.
- **Quality Gates:** Biome (lint/format), Vitest, TypeScript (`tsc --noEmit`).

## Key Development Commands
```bash
bun install           # Install dependencies
bun run dev           # Start frontend + backend dev server
bun run build         # Production build
bun run check         # Typecheck + lint + test (REQUIRED before every commit)
bun run test          # Run Vitest test suite
docker compose up     # Launch unified container
```

## Core Agentic Dock Architecture
- **Dock as the UI:** Pinned Nook tray with expandable dock icons representing tabs. Active tab renders directly into the tray background.
- **Panels as Tools:** Built-in tools (`Browser`, `Tools`, `Creations`, `Library`) and agent-generated plugins (isolated iframe micro-apps using the `window.polydocks` bridge).
- **Two Run Modes:**
  1. **Hosted / Web Demo:** Sandboxed workspaces in Docker/Bun, no direct OS execution.
  2. **Local Machine:** Access to explicitly granted folders and tools via typed grants.
