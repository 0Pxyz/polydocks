import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildPolyMcpServer } from "./poly-server";

export const mcpRouter = new Hono();

/**
 * PolyDocks as an MCP server (Streamable HTTP, stateless).
 * Any MCP client connects here: POST /mcp with Accept
 * "application/json, text/event-stream".
 */
mcpRouter.all("/", async (c) => {
  try {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = buildPolyMcpServer();
    await server.connect(transport);
    const res = await transport.handleRequest(c.req.raw);
    return res;
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
