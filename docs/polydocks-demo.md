# PolyDocks V2 — Hackathon Demonstration & Judge Guide

> **Core Axiom:** *The dock is the agent. The agent builds the dock. The community expands it.*

PolyDocks is an agentic workspace where the user interacts with an AI agent (powered by Meta Model API `muse-spark-1.3`) through natural language. Instead of confining conversations to a chatbot feed, the agent operates the environment directly: answering questions, conducting web research via TinyFish, operating tools, and **synthesizing new software plugins on demand**.

---

## 1. Architecture Highlights

| Layer | Implementation Details |
| :--- | :--- |
| **Agent Core** | Meta Model API (`muse-spark-1.3`), tool loop with Zod validation, reflective failure introspection (`inspect_execution`), dynamic skill injection. |
| **Multi-Workspace Scoping** | SQLite-backed `workspaces` and `workspace_plugins` tables with instant workspace switching from the top-left capsule. |
| **Dynamic Plugin Synthesis** | Agent tools `create_plugin`, `modify_plugin`, `operate_plugin`, and `publish_plugin`. Strips TypeScript types via Bun transpiler, blocks forbidden imports, and injects dark design tokens. |
| **Sandboxed Runtime** | `sandbox="allow-scripts"` iframe with bidirectional postMessage bridge exposing `window.polydocks` (storage scoped to `workspace:plugin`, capability invocation, theme tokens). |
| **Community Registry & Store** | Catalog of first-party and community-synthesized plugins with category filtering, search, live download counters, and 1-click installation. |
| **V1 Knowledge World Coexistence** | Procedural fantasy world maps, living cities, and educational quests remain 100% active and accessible. |

---

## 2. 3-Minute Live Demo Script (The Pomodoro Benchmark)

### Part 1: The Control Surface & Workspaces (0:00 - 0:35)
1. Launch PolyDocks (`bun run dev` or `docker compose up`).
2. Notice the persistent **Agentic Dock** pinned at the top of the viewport.
3. Click the **Workspace Switcher** in the top-left corner (`Focus Hub`).
4. Create a new workspace: `"Daily Focus"` and switch to it. Notice how the dock dynamically adapts its mounted tools to the active workspace.

### Part 2: Dynamic Software Synthesis (0:35 - 1:20)
1. Open the Agent conversation sheet (click the Sparkle orb in the dock or press <kbd>⌘K</kbd>).
2. Enter the prompt:
   > *"Build a Pomodoro timer with customizable focus & break sessions, task tagger, and session statistics."*
3. Watch the agent loop:
   - Recognizes intent: persistent software creation.
   - Synthesizes HTML5/TypeScript micro-app using `create_plugin`.
   - Validates code in Bun sandbox and mounts the tool into the dock.
4. The dock smoothly expands (`spring.soft`), a new **Clock** icon appears, and the Pomodoro timer renders into the active viewport.
5. Start a 25-minute focus session. Complete a session and notice the log entry saved persistently via `window.polydocks.storage`.

### Part 3: In-Place Modification (1:20 - 2:00)
1. Open the Agent composer again with <kbd>⌘K</kbd>.
2. Request a feature refinement:
   > *"Add a daily streak tracker and switch the accent styling to electric lime."*
3. The agent calls `modify_plugin`:
   - Inspects the existing code and updates it in-place.
   - Bumps the version to `1.0.1`.
   - Does **NOT** duplicate the dock icon.
   - Preserves previously recorded focus sessions.

### Part 4: Publishing & Community Store (2:00 - 2:40)
1. Instruct the agent:
   > *"Publish this Pomodoro timer to the community store so anyone can install it."*
2. The agent executes `publish_plugin`:
   - Manifest and code are indexed into `registry_plugins`.
3. Click the **Store** icon in the dock to open the **Plugin Store**.
4. See your published timer live in the catalog with category tags (`#productivity`, `#timer`).

### Part 5: Cross-Workspace One-Click Installation (2:40 - 3:00)
1. Switch to another workspace (`"Deep Learning Lab"`). Notice the timer is not present in this workspace dock.
2. Open the **Plugin Store** from the dock.
3. Click **Install** on the Pomodoro timer:
   - One-click installation mounts the timer into the `"Deep Learning Lab"` dock immediately.
4. Click **World Map** in the dock to fly out to the global cartography map, demonstrating seamless coexistence between PolyDocks V2 and the Polymax V1 knowledge game.

---

## 3. Automated Verification

The entire lifecycle is verified continuously by the automated test suite:

```bash
# Run the complete Pomodoro benchmark end-to-end
bun test tests/pomodoro-benchmark-e2e.test.ts

# Run the complete quality gate (typecheck, lint, 232 tests, and production build)
bun run check
```
