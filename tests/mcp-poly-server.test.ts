import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { buildPolyMcpServer } from "../server/mcp/poly-server";
import { capabilityBus } from "../server/plugins/bus";

async function linkedClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildPolyMcpServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  await client.connect(clientTransport);
  return client;
}

beforeEach(() => {
  capabilityBus.register(
    "test-mcp-probe",
    {
      id: "test-mcp-probe.echo",
      title: "Probe echo",
      description: "Echoes a message for MCP proxy tests",
      risk: "read",
      inputSchema: { type: "object", properties: { message: { type: "string" } } },
    } as never,
    async (input: { message?: string }) => ({ echoed: input.message })
  );
});

afterEach(() => {
  capabilityBus.unregister("test-mcp-probe.echo");
});

describe("polydocks MCP server (own server)", () => {
  it("lists capability tools", async () => {
    const client = await linkedClient();
    try {
      const result = await client.listTools();
      expect(Array.isArray(result.tools)).toBe(true);
      const names = result.tools.map((t) => t.name);
      expect(names).toContain("test-mcp-probe.echo");
    } finally {
      await client.close();
    }
  });

  it("proxies tools/call through the capability bus", async () => {
    const client = await linkedClient();
    try {
      const res = await client.callTool({ name: "test-mcp-probe.echo", arguments: { message: "hi" } });
      expect(res.isError).not.toBe(true);
      const text = (res.content as Array<{ type: string; text: string }>)[0]?.text || "";
      expect(text).toContain("hi");
    } finally {
      await client.close();
    }
  });

  it("exposes plugins and capabilities resources", async () => {
    const client = await linkedClient();
    try {
      const resources = await client.listResources();
      const uris = resources.resources.map((r) => r.uri);
      expect(uris).toContain("polydocks://plugins");
      expect(uris).toContain("polydocks://capabilities");
      const plugins = await client.readResource({ uri: "polydocks://plugins" });
      expect(plugins.contents.length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });

  it("exposes the dock-overview prompt", async () => {
    const client = await linkedClient();
    try {
      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((p) => p.name)).toContain("dock-overview");
      const prompt = await client.getPrompt({ name: "dock-overview" });
      expect(prompt.messages.length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });

  it("returns isError for unknown tools instead of raising", async () => {
    const client = await linkedClient();
    try {
      const res = await client.callTool({ name: "nope.does_not_exist", arguments: {} });
      expect(res.isError).toBe(true);
    } finally {
      await client.close();
    }
  });
});
