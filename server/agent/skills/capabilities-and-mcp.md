# Skill: Capabilities and MCP (discover, then invoke)

> Selected for capability, integration, and external-data prompts. Capabilities are plugin actions on the typed bus; remote data arrives through MCP adapters, never direct fetch.

## When to use

"Run", "use", or "wire" something that already exists: `find_capabilities` first, then `invoke_capability`. Never synthesize a plugin for an action a capability already exposes.

## Tools in order

`find_capabilities({query, limit?})` scores id (+5), title (+4), plugin (+3), description (+2) over enabled capabilities and returns `{query, found, capabilities: [{id, pluginId, title, description, risk, inputSchema}]}`. Then `invoke_capability({id, input?})` runs it as the agent and returns `{success, capabilityId, pluginId, data, durationMs}` or `{error, capabilityId, durationMs}` on failure.

## Risk and policy

Every capability declares `risk: read|write|destructive|external` (`server/plugins/manifest.ts`). `read` runs free; `destructive` and `external` always pause for user approval; `write` is auto-allowed for core and first-party plugins, otherwise it needs a grant or approval (15s timeout; denial halts with the reason). The bus enforces this per call, records each run in `executions`, and times out at 30s.

## Wiring data sources

Remote systems join as user-connected MCP servers (`POST /api/plugins/mcp/connect`, explicit permission grant in the Plugins UI); their tools appear as `mcp.<server>.<tool>` capabilities with `external` risk. Transport order is Streamable HTTP first, SSE fallback, stdio denied unless `MCP_ALLOW_STDIO=1`. HTTP and CLI adapters exist for fixed endpoints. The agent connects only on explicit user intent via `mcp_connect({name, url})`, lists with `mcp_list_servers`, searches connected tools progressively with `mcp_search_tools({query})` (names first, full schema later), disconnects with `mcp_disconnect`, and never fetches credentials or endpoints directly; it invokes the capability and passes `input` matching its schema.

PolyDocks is itself an MCP server: any external client connects at `POST /mcp` (Streamable HTTP, stateless) and gets the capability bus as tools plus `polymax://plugins` / `polymax://capabilities` resources. Details: `docs/mcp.md`.

## Common mistakes

Invoking before discovering (wrong id); guessing `input` instead of reading `inputSchema`; treating a denial as a bug (report it and ask); building a new plugin around one capability call.

## Example

"Run the search": `find_capabilities({query: "search web"})` returns `search.web` with its `inputSchema`; `invoke_capability({id: "search.web", input: {query: "raft consensus", limit: 5}})` runs it through policy and audit.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/find_capabilities.ts, server/agent/tools/invoke_capability.ts,
server/plugins/bus.ts, server/plugins/policy.ts, server/plugins/approval.ts,
server/plugins/manifest.ts, server/plugins/adapters/mcp.ts,
server/routes/plugins.ts, server/workspace/schema.sql
-->
