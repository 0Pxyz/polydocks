import { describe, expect, it } from "bun:test";
import { McpClientManager } from "../server/mcp/manager";

describe("mcp client manager", () => {
  it("starts with no connected servers", () => {
    McpClientManager.resetForTests();
    const mgr = McpClientManager.getInstance();
    expect(mgr.listServers()).toEqual([]);
    expect(mgr.searchTools("anything")).toEqual([]);
  });

  it("refuses stdio unless explicitly enabled", async () => {
    McpClientManager.resetForTests();
    const mgr = new McpClientManager({ allowStdio: false });
    await expect(
      mgr.connect({ name: "evil", transport: "stdio", command: "ls", args: [] })
    ).rejects.toThrow(/disabled/i);
  });

  it("requires a URL for HTTP transports", async () => {
    McpClientManager.resetForTests();
    const mgr = new McpClientManager({ allowStdio: true });
    await expect(mgr.connect({ name: "nou", transport: "streamable", args: [] })).rejects.toThrow(/URL/i);
  });

  it("disconnect of unknown server returns false", async () => {
    McpClientManager.resetForTests();
    const mgr = McpClientManager.getInstance();
    expect(await mgr.disconnect("ghost")).toBe(false);
  });

  it("registers mcp agent tools in the full catalog", async () => {
    const { fullTools } = await import("../server/agent/tools/index");
    const names = fullTools.map((t) => t.name);
    for (const expected of ["mcp_connect", "mcp_list_servers", "mcp_search_tools", "mcp_disconnect"]) {
      expect(names).toContain(expected);
    }
  });
});
