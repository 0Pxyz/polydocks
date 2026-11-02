import { describe, expect, it } from "bun:test";
import { loadMcpServersFromEnv, cleanServerName, McpServerDefSchema } from "../server/mcp/config";

describe("mcp config", () => {
  it("cleans server names to lowercase slug", () => {
    expect(cleanServerName("GitHub Prod")).toBe("github_prod");
    expect(cleanServerName("my-server.2")).toBe("my-server_2");
  });

  it("returns empty list when env is unset", () => {
    expect(loadMcpServersFromEnv({} as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("parses MCP_SERVERS_JSON arrays and resolves tokenEnv", () => {
    process.env.MCP_TEST_TOKEN_XYZ = "secret-123";
    const defs = loadMcpServersFromEnv({
      MCP_SERVERS_JSON: JSON.stringify([
        { name: "gh", url: "https://mcp.example.com/mcp", tokenEnv: "MCP_TEST_TOKEN_XYZ" },
      ]),
    } as NodeJS.ProcessEnv);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("gh");
    expect(defs[0].token).toBe("secret-123");
    delete process.env.MCP_TEST_TOKEN_XYZ;
  });

  it("skips invalid entries instead of throwing", () => {
    const defs = loadMcpServersFromEnv({
      MCP_SERVERS_JSON: JSON.stringify([{ url: "not-a-url" }]),
    } as NodeJS.ProcessEnv);
    expect(defs).toEqual([]);
  });

  it("rejects malformed JSON silently", () => {
    expect(loadMcpServersFromEnv({ MCP_SERVERS_JSON: "{bad" } as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("defaults transport to streamable", () => {
    const parsed = McpServerDefSchema.safeParse({ name: "x", url: "https://a.example/mcp" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.transport).toBe("streamable");
  });
});
