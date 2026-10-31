import { describe, expect, it } from "bun:test";
import { AGENT_MANIFEST, AGENT_TOOL_REQUIREMENTS, checkAgentPermission } from "./manifest";
import { validatePluginManifest } from "../plugins/manifest";

/** The agent as a first-party plugin under the same policy (#207). */
describe("Agent manifest & permission gate", () => {
  it("is a valid first-party plugin manifest", () => {
    const result = validatePluginManifest(AGENT_MANIFEST);
    expect(result.success).toBe(true);
    expect(AGENT_MANIFEST.trust).toBe("first-party");
    expect(AGENT_MANIFEST.permissions.length).toBeGreaterThan(0);
  });

  it("allows direct tools covered by the manifest", () => {
    expect(checkAgentPermission("write_file").allowed).toBe(true);
    expect(checkAgentPermission("read_file").allowed).toBe(true);
    expect(checkAgentPermission("record_memory").allowed).toBe(true);
  });

  it("allows bus-governed tools without an agent-level requirement", () => {
    // Capability-backed and facade tools carry no direct requirement:
    // their own plugin manifest governs them at invoke time.
    for (const name of ["search_web", "sandbox_exec", "open_source", "create_plugin", "dock_search", "invoke_capability"]) {
      expect(checkAgentPermission(name).allowed).toBe(true);
    }
    expect(checkAgentPermission("no_such_tool").allowed).toBe(true);
  });

  it("blocks the corresponding action when a permission is revoked", () => {
    const revoked = {
      ...AGENT_MANIFEST,
      permissions: AGENT_MANIFEST.permissions.filter(
        (p) => !(p.type === "fs" && (p as any).mode === "write")
      ),
    };
    expect(checkAgentPermission("write_file", revoked).allowed).toBe(false);
    expect(checkAgentPermission("write_file", revoked).reason).toContain("write_file");
    // Reads still pass on the remaining read grant.
    expect(checkAgentPermission("read_file", revoked).allowed).toBe(true);
    const fullyRevoked = { ...AGENT_MANIFEST, permissions: [] };
    expect(checkAgentPermission("read_file", fullyRevoked).allowed).toBe(false);
    // Ungoverned tools are unaffected by the revocation.
    expect(checkAgentPermission("dock_search", fullyRevoked).allowed).toBe(true);
  });

  it("lets a write grant cover reads in the same scope", () => {
    const writeOnly = {
      ...AGENT_MANIFEST,
      permissions: [{ type: "fs", scope: "workspace", mode: "write" } as const],
    };
    expect(checkAgentPermission("read_file", writeOnly).allowed).toBe(true);
    expect(checkAgentPermission("write_file", writeOnly).allowed).toBe(true);
  });

  it("keeps a requirement entry honest: every gated tool exists", async () => {
    const { fullTools, resolveTools } = await import("./tools/index");
    const names = new Set(resolveTools(fullTools).map((t) => t.name));
    for (const name of Object.keys(AGENT_TOOL_REQUIREMENTS)) {
      expect(names.has(name)).toBe(true);
    }
  });

  it("blocks the gated tool end to end when the manifest revokes the permission", async () => {
    const { runAgentLoop } = await import("./loop");
    const { z } = await import("zod");
    let executed = 0;
    let calls = 0;
    const gatedWrite: any = {
      name: "write_file",
      description: "test double for the gated write path",
      schema: z.object({ path: z.string(), content: z.string() }),
      execute: async () => {
        executed++;
        return { ok: true };
      },
    };
    const mockClient: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            calls++;
            if (params.stream && calls === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "call_gate_1",
                          type: "function",
                          function: { name: "write_file", arguments: JSON.stringify({ path: "x.md", content: "hi" }) },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return { choices: [{ message: { role: "assistant", content: "Done." } }] };
          },
        },
      },
    };
    const events: any[] = [];
    const revoked = { ...AGENT_MANIFEST, permissions: [] as any };
    const result = await runAgentLoop({
      prompt: "Write x",
      tools: [gatedWrite],
      llmClient: mockClient,
      agentManifest: revoked,
      onEvent: (e: any) => events.push(e),
    });
    expect(result.status).toBe("completed");
    expect(executed).toBe(0);
    const done = events.find((e: any) => e.type === "tool.done");
    expect((done?.payload?.result as any)?.error).toContain("write_file");
  });
});
