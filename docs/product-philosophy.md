# Polymax Product Philosophy

> "Everything is a plugin; the agent is the operator."

---

## 1. Everything is a Plugin

Every capability the user or the agent can discover, invoke, inspect, and extend is a plugin behind a single typed contract. 
The core runtime stays minimal and boring: it handles lifecycle, agent orchestration, capability routing, permission gates, persistence, and fundamental UI primitives. 

No plugin-specific logic lives in core. Native tools (Search, Browser, Notes, Workspace) are first-party plugins that adhere strictly to the exact same manifest, capability, and permission contracts as external and agent-generated tools.

## 2. The Agent is the Operator

Polymax does not treat the agent as an isolated chatbot relegated to a side panel. The agent is the active operator of the workspace.
- The agent discovers capabilities dynamically through progressive disclosure (`find_capabilities`).
- The agent invokes capabilities through the typed capability bus (`invoke_capability`).
- The agent inspects execution logs, evaluates results, detects failures, and autonomously iterates.
- The agent synthesizes new tools, inspects their runtime health in sandboxed environments, and promotes them to reusable plugins.

## 3. The Single Viewport Focus (The Dock IS the Product)

There is no infinite canvas sprawl, no floating window chaos, and no modal stacking.
- The Agentic Dock is the persistent control surface pinned to the screen.
- Each icon represents an active tool or workspace surface.
- Selecting an icon mounts its surface into the active viewport (`immersive`, `floating`, or `sheet`).
- When the agent builds or launches a tool, it renders cleanly into the dock's surface architecture.

## 4. Typed Contracts Over Brittle Scraping

Every action, whether triggered by a human via the dock or by the agent during an autonomous loop, passes through the capability bus.
- Capabilities declare explicit Zod input and output schemas.
- Payloads are validated before execution and outputs are checked before return.
- Capabilities define explicit risk levels: `read`, `write`, `destructive`, and `external`.
- The system emits structured, deterministic events over SSE (`tool.start`, `tool.done`), preserving backwards compatibility for all UI clients.

## 5. Progressive Disclosure

The agent is never overwhelmed by static context dumps or hundreds of tool schemas loaded simultaneously.
- Core workspace navigation and capability discovery tools remain always-loaded.
- Capabilities are surfaced on demand based on query similarity, keyword matching, and declared manifest triggers (`skill.triggers`).
- A concise summary of installed plugins informs the agent of its available domain reach without bloating the prompt window.

## 6. Security, Trust, and Default-Deny Confinement

Capabilities must earn trust through explicit, revocable user grants:
- **Default-Deny:** Undeclared network hosts, filesystem paths, and command executions are blocked.
- **Confinement:** Filesystem operations are strictly confined to the active city workspace or the plugin's data directory. Path traversal and symlink escapes are rejected.
- **SSRF Guard:** Network fetches block loopback, link-local, private subnets, and cloud metadata endpoints.
- **Canary Redaction:** Secrets are scoped and injected strictly into handler context; they never appear in prompts, tool results, logs, SSE streams, or error messages.
- **Sandboxed Execution:** Untrusted code and generated tools run exclusively in sandboxed iframes communicating via a permission-checked `postMessage` bridge.

## 7. The Capability Lifecycle

Every plugin traverses a deterministic, auditable lifecycle:
1. **Discover:** The registry inspects local manifests and configured MCP servers.
2. **Install:** Manifests are validated against `apiVersion: 1` schemas and compatibility checks.
3. **Configure:** User and workspace settings are applied from declared schemas.
4. **Authorize:** Scoped, default-deny permission grants are requested and stored. Destructive actions require explicit confirmation.
5. **Execute:** Calls route through the capability bus with timeouts, abort signals, and execution logging.
6. **Inspect:** Execution records, runtime errors, and performance metrics are auditable via `inspect_execution` and the Plugins dock tool.
7. **Evolve / Promote:** Successful experiences synthesized by the agent are packaged into declarative plugins reusable across all cities.
