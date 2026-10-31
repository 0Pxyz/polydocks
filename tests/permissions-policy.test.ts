import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateUrlForSsrf, isHostAllowed } from "../server/plugins/ssrf";
import { secretRedactor, redactSecrets, registerSecret } from "../server/plugins/redact";
import { approvalManager } from "../server/plugins/approval";
import { capabilityBus } from "../server/plugins/bus";
import { pluginRegistry } from "../server/plugins/registry";
import { createScopedExecutionContext } from "../server/plugins/context";
import { evaluateCapabilityPolicy } from "../server/plugins/policy";
import app from "../server/index";
import { db } from "../server/workspace/db";
import { z } from "zod";

describe("Permissions, Scoped Execution Context & User Approval Flow", () => {
  beforeEach(() => {
    approvalManager.clear();
    secretRedactor.clear();
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'ext_%' OR plugin_id LIKE 'test_%'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'ext_%' OR id LIKE 'test_%'").run();
  });

  afterEach(() => {
    approvalManager.clear();
    secretRedactor.clear();
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'ext_%' OR plugin_id LIKE 'test_%'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'ext_%' OR id LIKE 'test_%'").run();
  });

  describe("SSRF & Network Boundary Protection (validateUrlForSsrf)", () => {
    it("strictly blocks loopback addresses", () => {
      expect(validateUrlForSsrf("http://127.0.0.1:3000/api").safe).toBe(false);
      expect(validateUrlForSsrf("http://127.0.1.1:8080").safe).toBe(false);
      expect(validateUrlForSsrf("http://localhost:5173").safe).toBe(false);
      expect(validateUrlForSsrf("http://sub.localhost:80").safe).toBe(false);
      expect(validateUrlForSsrf("http://[::1]:3000").safe).toBe(false);
      expect(validateUrlForSsrf("http://0.0.0.0:8000").safe).toBe(false);
    });

    it("strictly blocks private IPv4 networks (RFC 1918 & CGNAT)", () => {
      expect(validateUrlForSsrf("http://10.0.0.1/admin").safe).toBe(false);
      expect(validateUrlForSsrf("http://10.255.255.254/internal").safe).toBe(false);
      expect(validateUrlForSsrf("http://172.16.0.10:8080").safe).toBe(false);
      expect(validateUrlForSsrf("http://172.31.255.255").safe).toBe(false);
      expect(validateUrlForSsrf("http://192.168.1.1/router").safe).toBe(false);
      expect(validateUrlForSsrf("http://100.64.0.1/cgnat").safe).toBe(false);
    });

    it("strictly blocks cloud metadata endpoints (AWS, GCP, Azure)", () => {
      expect(validateUrlForSsrf("http://169.254.169.254/latest/meta-data/").safe).toBe(false);
      expect(validateUrlForSsrf("http://metadata.google.internal/computeMetadata/v1/").safe).toBe(false);
      expect(validateUrlForSsrf("http://instance-data/latest/meta-data/").safe).toBe(false);
    });

    it("strictly blocks non-HTTP/HTTPS protocols", () => {
      expect(validateUrlForSsrf("file:///etc/passwd").safe).toBe(false);
      expect(validateUrlForSsrf("ftp://ftp.example.com").safe).toBe(false);
      expect(validateUrlForSsrf("gopher://gopher.floodgap.com").safe).toBe(false);
    });

    it("allows valid public web targets", () => {
      const publicWeb = validateUrlForSsrf("https://api.tinyfish.ai/search");
      expect(publicWeb.safe).toBe(true);
      expect(publicWeb.url?.hostname).toBe("api.tinyfish.ai");

      const pubHttps = validateUrlForSsrf("https://en.wikipedia.org/wiki/Stoicism");
      expect(pubHttps.safe).toBe(true);
    });

    it("enforces net host allowlists accurately", () => {
      expect(isHostAllowed("api.tinyfish.ai", ["api.tinyfish.ai"])).toBe(true);
      expect(isHostAllowed("sub.example.com", ["*.example.com"])).toBe(true);
      expect(isHostAllowed("example.com", ["*.example.com"])).toBe(true);
      expect(isHostAllowed("evil.com", ["*.example.com"])).toBe(false);
      expect(isHostAllowed("anything.org", ["*"])).toBe(true);
    });
  });

  describe("Canary Secret Redaction Utility", () => {
    it("redacts registered canary secrets across nested strings, objects, and arrays", () => {
      const canaryKey = "CANARY_SECRET_XYZ_987654";
      registerSecret(canaryKey);

      const rawText = `User token is ${canaryKey} and should be protected.`;
      const redacted = redactSecrets(rawText);
      expect(redacted).not.toContain(canaryKey);
      expect(redacted).toBe("User token is [REDACTED_SECRET] and should be protected.");

      const rawObj = {
        auth: {
          bearer: canaryKey,
          nestedList: [canaryKey, "normal_value"],
        },
      };
      const redactedObj: any = redactSecrets(rawObj);
      expect(redactedObj.auth.bearer).toBe("[REDACTED_SECRET]");
      expect(redactedObj.auth.nestedList[0]).toBe("[REDACTED_SECRET]");
      expect(redactedObj.auth.nestedList[1]).toBe("normal_value");
    });

    it("ensures secrets never leak into execution logging or SSE events", async () => {
      const canaryToken = "CANARY_AUTH_TOKEN_TEST_555";
      registerSecret(canaryToken);

      const testCapId = "test.secret_leak_check";
      capabilityBus.register("test_plugin", {
        id: testCapId,
        title: "Secret Leak Checker",
        description: "Checks secret safety",
        risk: "read",
        input: z.object({ token: z.string() }),
      }, async (input) => {
        return { echo: input.token };
      });

      const events: any[] = [];
      const result = await capabilityBus.invoke(testCapId, { token: canaryToken }, {
        actor: "agent",
        onEvent: (evt) => {
          events.push(evt);
        },
      });

      expect(result.success).toBe(true);
      expect((result.data as any).echo).toBe("[REDACTED_SECRET]");

      // Verify SSE events do not contain the secret
      const eventJson = JSON.stringify(events);
      expect(eventJson).not.toContain(canaryToken);
      expect(eventJson).toContain("[REDACTED_SECRET]");

      // Verify SQLite execution record does not contain the secret
      const execRow = db.query<{ input_json: string; output_json: string }, [string]>(
        "SELECT input_json, output_json FROM executions WHERE execution_id = ?"
      ).get(result.executionId);

      expect(execRow?.input_json).not.toContain(canaryToken);
      expect(execRow?.output_json).not.toContain(canaryToken);
    });
  });

  describe("Scoped Execution Context Confinement", () => {
    it("confines filesystem operations to the granted directory and blocks path traversal attacks", async () => {
      const testCity = "city_perm_test";
      const ctx = createScopedExecutionContext({
        pluginId: "test_fs_plugin",
        manifest: {
          apiVersion: 1,
          id: "test_fs_plugin",
          name: "Test FS Plugin",
          version: "1.0.0",
          description: "FS sandbox test",
          icon: "folder",
          trust: "first-party",
          capabilities: [],
          permissions: [{ type: "fs", scope: "workspace", mode: "write" }],
        },
        actor: "agent",
        workspaceId: testCity,
      });

      // Valid write within the granted root
      await ctx.fs.writeFile("notes/summary.md", "# Test Notes");
      expect(await ctx.fs.exists("notes/summary.md")).toBe(true);
      const readContent = await ctx.fs.readFile("notes/summary.md");
      expect(readContent).toBe("# Test Notes");

      // Traversal attack via ../ escaping the granted folder
      await expect(
        ctx.fs.readFile("../../../etc/passwd")
      ).rejects.toThrow("Path traversal violation");

      await expect(
        ctx.fs.writeFile("../escaped.txt", "malicious write")
      ).rejects.toThrow("Path traversal violation");
    });

    it("enforces declared secret access and rejects undeclared secrets", () => {
      process.env.DECLARED_TEST_KEY = "declared_value_123";
      process.env.UNDECLARED_TEST_KEY = "undeclared_value_999";

      const ctx = createScopedExecutionContext({
        pluginId: "secrets_test_plugin",
        manifest: {
          apiVersion: 1,
          id: "secrets_test_plugin",
          name: "Secrets Test Plugin",
          version: "1.0.0",
          description: "Test declared secrets",
          icon: "lock",
          trust: "external",
          capabilities: [],
          permissions: [{ type: "secret", name: "DECLARED_TEST_KEY" }],
        },
        actor: "agent",
      });

      // Declared secret access succeeds
      expect(ctx.secrets.get("DECLARED_TEST_KEY")).toBe("declared_value_123");

      // Undeclared secret access throws policy denial
      expect(() => ctx.secrets.get("UNDECLARED_TEST_KEY")).toThrow(
        /Secret access denied/
      );
    });

    it("scoped fetch blocks SSRF to cloud metadata and private addresses", async () => {
      const ctx = createScopedExecutionContext({
        pluginId: "fetch_test_plugin",
        manifest: {
          apiVersion: 1,
          id: "fetch_test_plugin",
          name: "Fetch Test Plugin",
          version: "1.0.0",
          description: "Test fetch SSRF",
          icon: "globe",
          trust: "external",
          capabilities: [],
          permissions: [{ type: "net", hosts: ["*"] }],
        },
        actor: "agent",
      });

      await expect(
        ctx.fetch("http://169.254.169.254/latest/meta-data/")
      ).rejects.toThrow(/SSRF Guard Blocked/);

      await expect(
        ctx.fetch("http://127.0.0.1:3000/api/health")
      ).rejects.toThrow(/SSRF Guard Blocked/);
    });
  });

  describe("Security Policy & User Approval Flow", () => {
    it("denies undeclared adapter permissions by default (default-deny policy)", async () => {
      const testPluginRecord = {
        id: "cli_undeclared_plugin",
        name: "CLI Undeclared Plugin",
        version: "1.0.0",
        enabled: true,
        trust: "external" as const,
        manifest: {
          apiVersion: 1 as const,
          id: "cli_undeclared_plugin",
          name: "CLI Undeclared Plugin",
          version: "1.0.0",
          description: "Testing default-deny",
          icon: "terminal",
          trust: "external" as const,
          capabilities: [],
          permissions: [], // No exec permission declared!
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await evaluateCapabilityPolicy({
        capability: {
          id: "cli_undeclared_plugin.run",
          pluginId: "cli_undeclared_plugin",
          title: "Run Command",
          description: "Runs CLI command",
          risk: "write",
          inputSchema: z.object({}),
          adapter: { cli: { binary: "git" } },
        },
        plugin: testPluginRecord,
        actor: "agent",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("requires execution access, but plugin");
    });

    it("halts destructive actions and requests user approval", async () => {
      const destructiveCap = "test_plugin.wipe_data";
      let approvalRequested = false;

      capabilityBus.register("test_plugin", {
        id: destructiveCap,
        title: "Wipe Data",
        description: "Destructive wipe",
        risk: "destructive",
        input: z.object({ confirm: z.boolean() }),
      }, async () => {
        return { wiped: true };
      });

      // Launch invocation asynchronously
      const invokePromise = capabilityBus.invoke(destructiveCap, { confirm: true }, {
        actor: "agent",
        timeoutMs: 3000,
        onEvent: (evt) => {
          if (evt.type === "approval.requested") {
            approvalRequested = true;
          }
        },
      });

      // Wait a moment for approval request to register
      await new Promise((r) => setTimeout(r, 50));
      const pending = approvalManager.listPending();
      expect(pending.length).toBeGreaterThan(0);
      expect(pending[0].capabilityId).toBe(destructiveCap);
      expect(pending[0].risk).toBe("destructive");

      // Approve once via approvalManager
      approvalManager.resolveApproval(pending[0].id, "allow_once");

      const result = await invokePromise;
      expect(result.success).toBe(true);
      expect((result.data as any).wiped).toBe(true);
      expect(approvalRequested).toBe(true);
    });

    it("halts and denies destructive actions on rejection or timeout", async () => {
      const destructiveCap = "test_plugin.drop_table";

      capabilityBus.register("test_plugin", {
        id: destructiveCap,
        title: "Drop Table",
        description: "Destructive drop",
        risk: "destructive",
        input: z.object({}),
      }, async () => {
        return { dropped: true };
      });

      // Launch invocation with a short timeout
      const invokePromise = capabilityBus.invoke(destructiveCap, {}, {
        actor: "agent",
        timeoutMs: 50, // Short timeout for auto-denial test
      });

      const result = await invokePromise;
      expect(result.success).toBe(false);
      expect(result.error).toContain("was rejected or timed out");
    });

    it("handles external capability first-use confirmation and honors allow_always grant", async () => {
      const externalCap = "ext_plugin.fetch_remote";

      pluginRegistry.install({
        apiVersion: 1,
        id: "ext_plugin",
        name: "External Plugin",
        version: "1.0.0",
        description: "External test",
        icon: "globe",
        trust: "external",
        capabilities: [
          {
            id: externalCap,
            title: "Fetch Remote",
            description: "Fetches remote data",
            risk: "external",
            input: z.object({ url: z.string() }),
          },
        ],
        permissions: [{ type: "net", hosts: ["*"] }],
      });

      capabilityBus.register("ext_plugin", {
        id: externalCap,
        title: "Fetch Remote",
        description: "Fetches remote data",
        risk: "external",
        input: z.object({ url: z.string() }),
      }, async (input) => {
        return { status: "fetched", url: input.url };
      });

      // First run: requires approval
      const firstRunPromise = capabilityBus.invoke(externalCap, { url: "https://example.com" }, {
        actor: "agent",
        workspaceId: "city_paris",
        timeoutMs: 2000,
      });

      await new Promise((r) => setTimeout(r, 50));
      const pending = approvalManager.listPending();
      expect(pending.length).toBe(1);

      // Approve always
      approvalManager.resolveApproval(pending[0].id, "allow_always");
      const firstResult = await firstRunPromise;
      expect(firstResult.success).toBe(true);

      // Second run: auto-approved because of allow_always grant
      const secondResult = await capabilityBus.invoke(externalCap, { url: "https://example.com" }, {
        actor: "agent",
        workspaceId: "city_paris",
      });

      expect(secondResult.success).toBe(true);
      expect((secondResult.data as any).status).toBe("fetched");
    });

    it("handles approval lifecycle via REST endpoints GET and POST /api/capabilities/approvals/:id", async () => {
      const reqPromise = approvalManager.requestApproval({
        pluginId: "api_test_plugin",
        capabilityId: "api_test_plugin.destroy",
        risk: "destructive",
        scope: "workspace:test",
        timeoutMs: 5000,
      });

      // 1. GET /api/capabilities/approvals
      const listRes = await app.fetch(new Request("http://localhost:3000/api/capabilities/approvals"));
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as any;
      expect(listData.approvals.length).toBeGreaterThan(0);
      const pendingItem = listData.approvals[0];

      // 2. GET /api/capabilities/approvals/:id
      const getRes = await app.fetch(new Request(`http://localhost:3000/api/capabilities/approvals/${pendingItem.id}`));
      expect(getRes.status).toBe(200);
      const getData = (await getRes.json()) as any;
      expect(getData.approval.id).toBe(pendingItem.id);

      // 3. POST /api/capabilities/approvals/:id
      const postRes = await app.fetch(
        new Request(`http://localhost:3000/api/capabilities/approvals/${pendingItem.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "allow_once" }),
        })
      );
      expect(postRes.status).toBe(200);
      const postData = (await postRes.json()) as any;
      expect(postData.success).toBe(true);
      expect(postData.decision).toBe("allow_once");

      const decision = await reqPromise;
      expect(decision).toBe("allow_once");
    });
  });
});
