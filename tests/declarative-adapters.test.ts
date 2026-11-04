import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pluginRegistry } from "../server/plugins/registry";
import { capabilityBus } from "../server/plugins/bus";
import { db } from "../server/workspace/db";
import {
  executeHttpAdapter,
  interpolateString,
} from "../server/plugins/adapters/http";
import {
  executeCliAdapter,
  resolveArgv,
} from "../server/plugins/adapters/cli";
import {
  connectMcpServer,
  executeMcpAdapter,
} from "../server/plugins/adapters/mcp";
import type { ExecutionContext } from "../server/plugins/bus";

describe("Declarative Adapters & Example Plugins (Issue #51)", () => {
  /**
   * #311: the repo no longer ships plugins-examples/ (dead weight, no
   * runtime consumers). Discovery coverage stages equivalent fixtures in
   * a temp dir instead of depending on repo fixture dirs.
   */
  const FIXTURES: Record<string, unknown> = {
    hello: {
      apiVersion: 1, id: "hello", name: "Hello World", version: "1.0.0",
      description: "Minimal reference plugin.", icon: "HandWaving", trust: "first-party",
      surfaces: [{ id: "hello.view", title: "Hello Card", icon: "HandWaving", variant: "floating", entry: "index.html" }],
      capabilities: [{ id: "hello.greet", title: "Greet User", description: "Return a friendly greeting.", risk: "read",
        adapter: { http: { method: "GET", urlTemplate: "https://en.wikipedia.org/api/rest_v1/page/summary/{name}", byteCap: 1048576 } },
        input: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } }],
      permissions: [{ type: "net", hosts: ["en.wikipedia.org"] }],
    },
    wikipedia: {
      apiVersion: 1, id: "wikipedia", name: "Wikipedia Summary", version: "1.0.0",
      description: "Fetch concise Wikipedia summaries.", icon: "BookOpen", trust: "first-party",
      permissions: [{ type: "net", hosts: ["en.wikipedia.org"] }],
      capabilities: [{ id: "wikipedia.summary", title: "Wikipedia Summary", description: "Fetch the summary of an article.", risk: "read",
        adapter: { http: { method: "GET", urlTemplate: "https://en.wikipedia.org/api/rest_v1/page/summary/{title}", byteCap: 1048576,
          headers: { "User-Agent": "Polydocks/1.0 (https://github.com/0Pxyz/polydocks)" } } },
        input: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } }],
    },
    "git-status": {
      apiVersion: 1, id: "git-status", name: "Git Status", version: "1.0.0",
      description: "Safe read-only CLI plugin.", icon: "GitBranch", trust: "first-party",
      permissions: [{ type: "exec", commands: ["git"] }, { type: "fs", scope: "workspace", mode: "read" }],
      capabilities: [{ id: "git-status.check", title: "Git Status Check", description: "Run git status porcelain.", risk: "read",
        adapter: { cli: { bin: "git", args: ["status", "--porcelain"], workingDir: "workspace" } },
        input: { type: "object", properties: {} } }],
    },
  };
  const stagedDir = fs.mkdtempSync(path.join(os.tmpdir(), "example-plugins-"));
  for (const [id, manifest] of Object.entries(FIXTURES)) {
    fs.mkdirSync(path.join(stagedDir, id), { recursive: true });
    fs.writeFileSync(path.join(stagedDir, id, "plugin.json"), JSON.stringify(manifest, null, 2));
  }
  beforeEach(() => {
    db.query("DELETE FROM executions WHERE plugin_id LIKE 'ext_%' OR plugin_id LIKE 'test_%' OR plugin_id LIKE 'mcp_%' OR plugin_id IN ('wikipedia', 'git-status', 'hello')").run();
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'ext_%' OR plugin_id LIKE 'test_%' OR plugin_id LIKE 'mcp_%' OR plugin_id IN ('wikipedia', 'git-status', 'hello')").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'ext_%' OR id LIKE 'test_%' OR id LIKE 'mcp_%' OR id IN ('wikipedia', 'git-status', 'hello')").run();
  });

  afterEach(() => {
    db.query("DELETE FROM executions WHERE plugin_id LIKE 'ext_%' OR plugin_id LIKE 'test_%' OR plugin_id LIKE 'mcp_%' OR plugin_id IN ('wikipedia', 'git-status', 'hello')").run();
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'ext_%' OR plugin_id LIKE 'test_%' OR plugin_id LIKE 'mcp_%' OR plugin_id IN ('wikipedia', 'git-status', 'hello')").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'ext_%' OR id LIKE 'test_%' OR id LIKE 'mcp_%' OR id IN ('wikipedia', 'git-status', 'hello')").run();
  });

  describe("Declarative HTTP Adapter", () => {
    it("interpolates URL templates and query parameters accurately", () => {
      const url = interpolateString("https://api.example.com/items/{id}/details", { id: "item-123" }, true);
      expect(url).toBe("https://api.example.com/items/item-123/details");

      const nested = interpolateString("https://api.example.com/{user.org}/{user.name}", {
        user: { org: "poly", name: "max" },
      }, true);
      expect(nested).toBe("https://api.example.com/poly/max");
    });

    it("executes HTTP GET requests through SSRF-safe ctx.fetch with bearer secrets", async () => {
      let fetchedUrl = "";
      let authHeader = "";

      const mockCtx: ExecutionContext = {
        actor: "user",
        log: () => {},
        secrets: {
          get: (name: string) => (name === "TEST_API_KEY" ? "sec_key_xyz_123" : undefined),
        },
        fetch: async (url, init) => {
          fetchedUrl = url.toString();
          authHeader = (init?.headers as Record<string, string>)?.Authorization || "";
          return new Response(JSON.stringify({ status: "ok", data: { count: 42 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      };

      const result = await executeHttpAdapter(
        {
          method: "GET",
          urlTemplate: "https://api.example.com/stats",
          queryParams: { filter: "{filter}" },
          bearerSecret: "TEST_API_KEY",
          responsePath: "data.count",
        },
        { filter: "active" },
        mockCtx
      );

      expect(fetchedUrl).toBe("https://api.example.com/stats?filter=active");
      expect(authHeader).toBe("Bearer sec_key_xyz_123");
      expect(result).toBe(42);
    });

    it("handles POST request bodies with templates", async () => {
      let sentBody = "";
      const mockCtx: ExecutionContext = {
        actor: "user",
        log: () => {},
        fetch: async (_url, init) => {
          sentBody = String(init?.body);
          return new Response(JSON.stringify({ success: true, createdId: "res_99" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        },
      };

      const result = await executeHttpAdapter(
        {
          method: "POST",
          urlTemplate: "https://api.example.com/create",
          bodyTemplate: {
            title: "{item.title}",
            priority: 1,
          },
        },
        { item: { title: "Polydocks Architecture" } },
        mockCtx
      );

      const parsed = JSON.parse(sentBody);
      expect(parsed.title).toBe("Polydocks Architecture");
      expect(parsed.priority).toBe(1);
      expect((result as any).createdId).toBe("res_99");
    });

    it("throws helpful error when HTTP status is not ok", async () => {
      const mockCtx: ExecutionContext = {
        actor: "user",
        log: () => {},
        fetch: async () => {
          return new Response("Not found resource", { status: 404, statusText: "Not Found" });
        },
      };

      expect(
        executeHttpAdapter(
          {
            method: "GET",
            urlTemplate: "https://api.example.com/missing",
          },
          {},
          mockCtx
        )
      ).rejects.toThrow("HTTP request failed with status 404 (Not Found)");
    });
  });

  describe("Declarative CLI Adapter", () => {
    it("resolves argv templates without shell interpolation", () => {
      const args = resolveArgv(["status", "--limit", "{limit}", "{files}"], {
        limit: "10",
        files: ["file1.txt", "file2.txt"],
      });

      expect(args).toEqual(["status", "--limit", "10", "file1.txt", "file2.txt"]);
    });

    it("strictly rejects unsafe binary names containing shell metacharacters", () => {
      const mockCtx: ExecutionContext = {
        actor: "user",
        log: () => {},
        exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      };

      expect(
        executeCliAdapter(
          {
            bin: "git; rm -rf /",
            args: [],
          },
          {},
          mockCtx
        )
      ).rejects.toThrow("Invalid or unsafe binary name");
    });

    it("executes valid CLI commands safely through ctx.exec", async () => {
      let executedBin = "";
      let executedArgs: string[] = [];

      const mockCtx: ExecutionContext = {
        actor: "user",
        log: () => {},
        exec: async (bin, args) => {
          executedBin = bin;
          executedArgs = args;
          return { stdout: "M file.ts\n?? new.ts\n", stderr: "", exitCode: 0 };
        },
      };

      const result = await executeCliAdapter(
        {
          bin: "git",
          args: ["status", "--porcelain"],
        },
        {},
        mockCtx
      );

      expect(executedBin).toBe("git");
      expect(executedArgs).toEqual(["status", "--porcelain"]);
      expect(result.stdout).toContain("M file.ts");
      expect(result.exitCode).toBe(0);
    });

    it("skips gracefully when command binary is not installed on the host", async () => {
      const mockCtx: ExecutionContext = {
        actor: "user",
        log: () => {},
        exec: async () => {
          throw new Error("spawn nonexistent_binary_tool ENOENT");
        },
      };

      const result = await executeCliAdapter(
        {
          bin: "nonexistent_binary_tool",
          args: ["--version"],
        },
        {},
        mockCtx
      );

      expect(result.skipped).toBe(true);
      expect(result.exitCode).toBe(127);
      expect(result.reason).toContain("is not installed or available on the host system");
    });
  });

  describe("MCP SDK Client Adapter", () => {
    it("gating: strictly rejects stdio transport unless allowStdio is explicitly true", async () => {
      const res = await connectMcpServer({
        name: "TestStdioServer",
        transport: "stdio",
        command: "node",
        allowStdio: false, // Default or disallowed
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Stdio transport for MCP is disabled for security unless explicitly enabled via allowStdio.");
    });

    it("executeMcpAdapter rejects stdio invocation if allowStdio is not enabled", async () => {
      const mockCtx: ExecutionContext = {
        actor: "user",
        log: () => {},
      };

      expect(
        executeMcpAdapter(
          {
            server: "test",
            tool: "some_tool",
            transport: "stdio",
            command: "python",
            allowStdio: false,
          },
          {},
          mockCtx
        )
      ).rejects.toThrow("Stdio transport for MCP is disabled for security unless explicitly enabled via allowStdio.");
    });

    it("connects to an external MCP server, discovers tools, and maps them to bus capabilities", async () => {
      // Mock fetch in global environment for HTTP discovery
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (input: any, init?: any) => {
          const body = JSON.parse(init?.body || "{}");
          if (body.method === "initialize") {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                result: {
                  protocolVersion: "2025-11-25",
                  capabilities: {},
                  serverInfo: { name: "postgres-mock", version: "1.0.0" },
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (body.method === "notifications/initialized") {
            return new Response(null, { status: 202 });
          }
          if (body.method === "tools/list") {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                result: {
                  tools: [
                    {
                      name: "query_database",
                      description: "Execute a read-only query on PostgreSQL",
                      inputSchema: {
                        type: "object",
                        properties: { query: { type: "string" } },
                        required: ["query"],
                      },
                    },
                    {
                      name: "list_tables",
                      description: "List all tables in database",
                      inputSchema: { type: "object", properties: {} },
                    },
                  ],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }

          if (body.method === "tools/call") {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                result: {
                  content: [{ type: "text", text: `Executed ${body.params.name} successfully` }],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }

          return new Response("Not found", { status: 404 });
        }) as typeof fetch;

        const connectResult = await connectMcpServer({
          name: "PostgresCloud",
          url: "https://mcp.postgres.mock/v1",
          token: "pg_secret_token",
          transport: "http",
        });

        expect(connectResult.success).toBe(true);
        expect(connectResult.tools.length).toBe(2);
        expect(connectResult.tools[0].name).toBe("query_database");

        // Verify capabilities registered on the bus
        const queryCap = capabilityBus.getCapability("mcp.postgrescloud.query_database");
        expect(queryCap).not.toBeNull();
        expect(queryCap?.title).toBe("PostgresCloud: query_database");
        expect(queryCap?.risk).toBe("external"); // Default risk to external (prompts on first use!)

        const listCap = capabilityBus.getCapability("mcp.postgrescloud.list_tables");
        expect(listCap).not.toBeNull();
        expect(listCap?.risk).toBe("external");

        // Execute tool through executeMcpAdapter
        const execRes = await executeMcpAdapter(
          queryCap?.adapter?.mcp,
          { query: "SELECT * FROM users" },
          { actor: "user", log: () => {} }
        );

        expect(Array.isArray(execRes)).toBe(true);
        expect((execRes as any)[0].text).toContain("Executed query_database successfully");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("Example Plugins Discovery & Execution", () => {
    it("discovers all example plugins from plugins-examples/ directory", () => {
      const examplesDir = stagedDir;
      const discovery = pluginRegistry.discoverFromDirectory(examplesDir);

      expect(discovery.discovered).toBeGreaterThanOrEqual(3);
      expect(discovery.errors).toEqual([]);

      // Verify installed records
      const wiki = pluginRegistry.get("wikipedia");
      expect(wiki).not.toBeNull();
      expect(wiki?.name).toBe("Wikipedia Summary");
      expect(wiki?.manifest.capabilities[0].id).toBe("wikipedia.summary");
      expect(wiki?.manifest.capabilities[0].adapter?.http).toBeDefined();

      const git = pluginRegistry.get("git-status");
      expect(git).not.toBeNull();
      expect(git?.name).toBe("Git Status");
      expect(git?.manifest.capabilities[0].id).toBe("git-status.check");
      expect(git?.manifest.capabilities[0].adapter?.cli).toBeDefined();

      const hello = pluginRegistry.get("hello");
      expect(hello).not.toBeNull();
      expect(hello?.name).toBe("Hello World");
      expect(hello?.manifest.surfaces?.[0].entry).toBe("index.html");
      expect(hello?.manifest.capabilities[0].id).toBe("hello.greet");
    });

    it("executes wikipedia.summary capability end-to-end via CapabilityBus", async () => {
      const examplesDir = stagedDir;
      pluginRegistry.discoverFromDirectory(examplesDir);

      // Register capability on bus
      const wikiPlugin = pluginRegistry.get("wikipedia")!;
      capabilityBus.register("wikipedia", wikiPlugin.manifest.capabilities[0]);

      // Mock network response for wikipedia
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (input: any) => {
          if (String(input).includes("en.wikipedia.org/api/rest_v1/page/summary/Stoicism")) {
            return new Response(
              JSON.stringify({
                title: "Stoicism",
                extract: "Stoicism is a school of Hellenistic philosophy founded by Zeno of Citium.",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response("Not found", { status: 404 });
        }) as typeof fetch;

        const invokeRes = await capabilityBus.invoke<any>(
          "wikipedia.summary",
          { title: "Stoicism" },
          { actor: "agent" }
        );

        expect(invokeRes.success).toBe(true);
        expect(invokeRes.data?.title).toBe("Stoicism");
        expect(invokeRes.data?.extract).toContain("Stoicism is a school of Hellenistic philosophy");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("executes git-status.check capability end-to-end via CapabilityBus", async () => {
      const examplesDir = stagedDir;
      pluginRegistry.discoverFromDirectory(examplesDir);

      const gitPlugin = pluginRegistry.get("git-status")!;
      capabilityBus.register("git-status", gitPlugin.manifest.capabilities[0]);

      const invokeRes = await capabilityBus.invoke<{ stdout: string; stderr: string; exitCode: number }>(
        "git-status.check",
        {},
        { actor: "agent" }
      );

      expect(invokeRes.success).toBe(true);
      expect(typeof invokeRes.data?.stdout).toBe("string");
      expect(invokeRes.data?.exitCode).toBe(0);
    });
  });
});
