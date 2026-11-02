# MCP in PolyDocks

PolyDocks speaks MCP in both directions over Streamable HTTP:

- **As a server:** any MCP client (Claude Code, Cursor, our own scripts)
  connects at `POST /mcp` and gets the typed capability bus as tools,
  plus `polymax://plugins` / `polymax://capabilities` resources and a
  `dock-overview` prompt. Stateless transport: no session affinity.
- **As a client:** external MCP servers connect once and their tools
  appear as first-class `mcp.<server>.<tool>` capabilities with
  `external` risk (approval on first use).

## Connect an external server

Easiest path (UI or REST):

```bash
curl -X POST localhost:3000/api/plugins/mcp/connect \
  -H 'Content-Type: application/json' \
  -d '{"name":"github","url":"https://mcp.example.com/mcp","confirmed":true}'
```

Options: `transport` (`streamable` default, `sse` fallback, `stdio`
gated), `token` (prefer `tokenEnv` via `MCP_SERVERS_JSON`), `headers`,
`command`/`args` for stdio (needs `MCP_ALLOW_STDIO=1`).

Manage afterwards:

```bash
curl localhost:3000/api/plugins/mcp/servers
curl -X POST localhost:3000/api/plugins/mcp/search \
  -d '{"query":"open pull request","limit":5}'
curl -X POST localhost:3000/api/plugins/mcp/refresh -d '{"name":"github"}'
curl -X POST localhost:3000/api/plugins/mcp/disconnect -d '{"name":"github"}'
```

Preconfigure servers without clicks via `MCP_SERVERS_JSON` in `.env`
(see `.env.example`). Tokens stay host-side; generated code and the
model only ever see typed function results, never credentials.

## Agent tools

- `mcp_connect` — connect by name + url (explicit user intent).
- `mcp_list_servers` — what is connected.
- `mcp_search_tools` — progressive discovery Layer 1: name + one-line
  description only, keyword scored.
- `mcp_disconnect` — close and free context.
- `find_capabilities` / `invoke_capability` stay the execution path
  (Layers 2-3): inspect the full schema, then invoke through policy
  and audit.

## Client best practices applied

From https://modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices:

- **Progressive discovery:** tool definitions stay cached host-side;
  the model loads names first (`mcp_search_tools`), full schemas only
  for the chosen tool (`find_capabilities`), grouped by server.
- **Transport order:** Streamable HTTP first, SSE fallback, stdio
  denied by default. Per-call 30s timeout, 64KB output cap.
- **Cache discipline:** 60s TTL on `tools/list`; explicit
  `POST /mcp/refresh` is the `list_changed` invalidation path.
- **Security:** Bearer tokens in host-held headers, loopback demo
  guard unchanged, `isError` tool failures return as data so the
  model can retry instead of crashing the turn.
- **No code-mode sandbox yet:** sequential `tools/call` round trips
  only. Programmatic batching (sandboxed code calling typed stubs)
  is a later slice; the manager API (`callTool`) is already shaped
  for it.

## Verify

```bash
bun test tests/mcp-config.test.ts tests/mcp-manager.test.ts tests/mcp-poly-server.test.ts
curl -X POST localhost:3000/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
