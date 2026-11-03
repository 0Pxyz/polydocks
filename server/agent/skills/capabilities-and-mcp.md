# Skill: Capabilities and MCP (discover, then invoke)

> Selected for capability, integration, and external-data prompts. Capabilities are plugin actions on the typed bus; remote data arrives through MCP adapters, never direct fetch.

## When to use

"Run", "use", or "wire" something that already exists: `find_capabilities` first, then `invoke_capability`. Never synthesize a plugin for an action a capability already exposes.

## Tools in order

`find_capabilities({query, limit?})` scores id/title/plugin/description and returns `{capabilities: [{id, pluginId, title, description, risk, inputSchema}]}`. Then `invoke_capability({id, input?})` runs it, returning `{success, data, durationMs}` or `{error, durationMs}`.

## Risk and policy

Every capability declares `risk: read|write|destructive|external`. `read` runs free; `destructive` and `external` always pause for approval; `write` is auto-allowed for core/first-party, else needs a grant (15s timeout). The bus enforces per call, records each run, times out at 30s.

## Wiring data sources

Remote systems join as user-connected MCP servers (explicit grant in the Plugins UI); tools appear as `mcp.<server>.<tool>` with `external` risk. Transport order is Streamable HTTP, SSE fallback, stdio denied unless `MCP_ALLOW_STDIO=1`. Connect only on explicit intent via `mcp_connect({name, url})`, list with `mcp_list_servers`, search tools with `mcp_search_tools({query})`, disconnect with `mcp_disconnect`; never fetch endpoints directly.

PolyDocks is itself an MCP server: external clients connect at `POST /mcp` (Streamable HTTP, stateless). Details: `docs/mcp.md`.

## Common mistakes

Invoking before discovering; guessing `input` instead of reading `inputSchema`; treating a denial as a bug; building a plugin around one capability call.

## Example

"Run the search": `find_capabilities({query: "search web"})` → `search.web`; `invoke_capability({id: "search.web", input: {query: "raft consensus"}})` runs it through policy and audit.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/find_capabilities.ts, server/agent/tools/invoke_capability.ts,
server/plugins/bus.ts, server/plugins/policy.ts, server/plugins/approval.ts,
server/plugins/manifest.ts, server/plugins/adapters/mcp.ts,
server/routes/plugins.ts, server/workspace/schema.sql
-->
