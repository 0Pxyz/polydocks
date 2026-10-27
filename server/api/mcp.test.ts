import { describe, expect, it } from "bun:test";
import app from "../index";

describe("Model Context Protocol (MCP) Server Endpoint", () => {
  it("responds to initialize request with protocolVersion and capabilities", async () => {
    const res = await app.fetch(
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {},
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result.serverInfo.name).toBe("polymax");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it("lists available MCP tools via tools/list", async () => {
    const res = await app.fetch(
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.result.tools)).toBe(true);
    const toolNames = body.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain("list_cities");
    expect(toolNames).toContain("get_city_workspace");
    expect(toolNames).toContain("create_city_note");
    expect(toolNames).toContain("synthesize_dock_plugin");
    expect(toolNames).toContain("run_tinyfish_research");
  });

  it("executes tools/call for list_cities", async () => {
    const res = await app.fetch(
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "list_cities",
            arguments: {},
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.result.content).toBeDefined();
    expect(body.result.content[0].type).toBe("text");
  });

  it("serves machine-readable /.well-known/llms.txt", async () => {
    const res = await app.fetch(new Request("http://localhost:3000/.well-known/llms.txt"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Polymax");
    expect(text).toContain("/api/mcp");
    expect(text).toContain("workspace/<city-id>/");
  });
});
