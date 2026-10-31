import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { runAgentLoop, type AgentStepEvent } from "../server/agent/loop";
import { create_plugin } from "../server/agent/tools/create_plugin";
import { apply_theme } from "../server/agent/tools/apply_theme";
import { classifyIntent, INTENT_TOOL_DENYLIST } from "../server/agent/intent";
import { adaptBackendEvent } from "../src/lib/agent/events";
import { db } from "../server/workspace/db";

function mockLlm(script: Array<{ toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>; content?: string }>) {
  let step = 0;
  let lastParams: any = null;
  const llm: any = {
    chat: {
      completions: {
        create: async (params: any) => {
          lastParams = params;
          const turn = script[Math.min(step, script.length - 1)];
          step++;
          if (turn.toolCalls && turn.toolCalls.length > 0) {
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: turn.toolCalls.map((t) => ({
                      id: t.id,
                      type: "function",
                      function: { name: t.name, arguments: JSON.stringify(t.args) },
                    })),
                  },
                },
              ],
            };
          }
          return { choices: [{ message: { role: "assistant", content: turn.content || "Done." } }] };
        },
      },
    },
  };
  return { llm, getLastParams: () => lastParams, getSteps: () => step };
}

function collect() {
  const events: AgentStepEvent[] = [];
  return { events, onEvent: (ev: AgentStepEvent) => void events.push(ev) };
}

describe("Intent routing (deterministic, no special cases)", () => {
  it("routes theme requests with images to the theme intent", () => {
    expect(classifyIntent("Add this background to my theme", { hasImageAttachments: true })).toBe("theme");
    expect(classifyIntent("Add this background to my theme")).toBe("theme");
    expect(classifyIntent("mude o papel de parede")).toBe("theme");
    expect(classifyIntent("use this image as my wallpaper")).toBe("theme");
  });

  it("routes artifact updates to plugin_update, never research", () => {
    expect(classifyIntent("Update the existing feed to group articles by topic")).toBe("plugin_update");
    expect(classifyIntent("Modify plugin pomodoro to add streaks")).toBe("plugin_update");
    // Broken behavior routes to plugin_fix (patch in place, never recreate).
    expect(classifyIntent("Fix this tool, it crashes on load")).toBe("plugin_fix");
  });

  it("keeps research intent on its existing matcher; no domain intent exists", () => {
    expect(classifyIntent("Search the web for the best go-to-market strategies")).toBe("research");
    expect(classifyIntent("Explain how transformers work")).toBe("general");
  });

  it("denies research/synthesis tools for theme intent and create tools for updates", () => {
    expect(INTENT_TOOL_DENYLIST.theme).toContain("search_web");
    expect(INTENT_TOOL_DENYLIST.theme).toContain("fetch_page");
    expect(INTENT_TOOL_DENYLIST.plugin_update).toContain("create_plugin");
    expect(INTENT_TOOL_DENYLIST.general).toEqual([]);
  });
});

describe("Scenario A: theme customization with an image attachment", () => {
  it("invokes apply_theme with the attachment id and never offers web search", async () => {
    const { llm, getLastParams } = mockLlm([
      { toolCalls: [{ id: "call_theme_1", name: "apply_theme", args: { attachmentId: "att-1" } }] },
      { content: "Theme updated with your image." },
    ]);
    const { events, onEvent } = collect();

    const result = await runAgentLoop({
      prompt: "Add this background to my theme",
      attachments: [
        { id: "att-1", name: "1525909-uuid.jpeg", type: "image/jpeg", size: 1024, dataUrl: "data:image/jpeg;base64,AAA", isImage: true },
      ],
      llmClient: llm,
      onEvent,
    });

    expect(result.status).toBe("completed");
    const offered = (getLastParams().tools as Array<{ function: { name: string } }>).map((t) => t.function.name);
    expect(offered).toContain("apply_theme");
    expect(offered).not.toContain("search_web");
    expect(offered).not.toContain("fetch_page");

    const starts = events.filter((e) => e.type === "tool.start");
    expect(starts.length).toBe(1);
    expect(starts[0].payload?.name).toBe("apply_theme");

    // The model can see the real attachment id, so it can reference it.
    const sentMessages = (getLastParams().messages as Array<any>).filter((m) => m.role === "user");
    expect(JSON.stringify(sentMessages)).toContain("att-1");

    const themed = events.filter((e) => e.type === "theme.apply");
    expect(themed.length).toBe(1);
    expect((themed[0].payload as any)?.attachmentId).toBe("att-1");

    const agentStart = events.find((e) => e.type === "agent.start");
    expect((agentStart?.payload as any)?.intent).toBe("theme");
    // Correct model for the task: Spark handles images natively — no vision downgrade.
    expect((agentStart?.payload as any)?.model).toBe("muse-spark-1.3");
  });
});

describe("Scenario B: explicit research still uses search with a derived query", () => {
  it("calls search_web with a query derived from this request", async () => {
    const fakeSearch = {
      name: "search_web",
      description: "stubbed web search",
      schema: (await import("zod")).z.object({ query: (await import("zod")).z.string() }),
      execute: async (args: any) => ({ query: args.query, results: [{ title: "GTM guide" }] }),
    } as any;
    const { llm } = mockLlm([
      { toolCalls: [{ id: "call_search_1", name: "search_web", args: { query: "best go-to-market strategies mobile apps launch" } }] },
      { content: "Here is what I found." },
    ]);
    const { events, onEvent } = collect();

    const result = await runAgentLoop({
      prompt: "Search the web for the best go-to-market strategies for mobile apps launch",
      tools: [fakeSearch],
      llmClient: llm,
      onEvent,
    });

    expect(result.status).toBe("completed");
    const starts = events.filter((e) => e.type === "tool.start");
    expect(starts.some((e) => e.payload?.name === "search_web")).toBe(true);
    expect(String((starts.find((e) => e.payload?.name === "search_web")?.payload as any)?.arguments?.query)).toContain(
      "go-to-market"
    );
  });
});

describe("Scenario C: plugin update never recreates", () => {
  it("hides create tools from the offered catalog for update intents", async () => {
    const { llm, getLastParams } = mockLlm([{ content: "Which plugin should I update? Tell me its name." }]);
    const { events, onEvent } = collect();

    const result = await runAgentLoop({
      prompt: "Update the existing feed to group articles by topic",
      llmClient: llm,
      onEvent,
    });

    expect(result.status).toBe("completed");
    const offered = (getLastParams().tools as Array<{ function: { name: string } }>).map((t) => t.function.name);
    expect(offered).not.toContain("create_plugin");
    expect(offered).not.toContain("create_tab");
    expect(offered).toContain("modify_plugin");
    expect(events.filter((e) => e.type === "tool.start").length).toBe(0);
  });

  it("create_plugin refuses to overwrite and points at modify_plugin", async () => {
    // The duplicate guard checks registries AND plugin_files namespaces.
    db.query("DELETE FROM workspace_plugins WHERE plugin_id = 'test-guard-dup'").run();
    db.query("DELETE FROM plugins WHERE id = 'test-guard-dup'").run();
    db.query("DELETE FROM plugin_files WHERE plugin_id = 'test-guard-dup'").run();
    try {
      const first = await create_plugin.execute(
        { id: "test-guard-dup", name: "Guard", description: "guard", code: "const a = 1;" },
        { workspaceId: "default", step: 1 }
      );
      expect((first as any).success).toBe(true);
      const second = await create_plugin.execute(
        { id: "test-guard-dup", name: "Guard", description: "guard", code: "const a = 2;" },
        { workspaceId: "default", step: 1 }
      );
      expect((second as any).success).toBe(false);
      expect(String((second as any).error)).toContain("modify_plugin");
    } finally {
      db.query("DELETE FROM workspace_plugins WHERE plugin_id = 'test-guard-dup'").run();
      db.query("DELETE FROM plugins WHERE id = 'test-guard-dup'").run();
      db.query("DELETE FROM plugin_files WHERE plugin_id = 'test-guard-dup'").run();
    }
  });
});

describe("Scenario D: context-only questions stay tool-free", () => {
  it("answers without tool calls or workspace scope", async () => {
    const { llm } = mockLlm([{ content: "Self-attention lets every token weigh every other token." }]);
    const { events, onEvent } = collect();
    let capturedSystem = "";
    const probing: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            capturedSystem = params.messages.find((m: any) => m.role === "system")?.content || "";
            return llm.chat.completions.create(params);
          },
        },
      },
    };

    const result = await runAgentLoop({ prompt: "Explain how transformers work", llmClient: probing, onEvent });
    expect(result.status).toBe("completed");
    expect(events.filter((e) => e.type === "tool.start").length).toBe(0);
    expect(capturedSystem).not.toContain("Workspace Scope");
  });
});

describe("Scenario E: tool failure reaches an explicit terminal state", () => {
  it("surfaces the error, stops progress, and still finishes", async () => {
    const boom = {
      name: "boom",
      description: "always fails",
      schema: (await import("zod")).z.object({}),
      execute: async () => {
        throw new Error("kaput");
      },
    } as any;
    const { llm } = mockLlm([
      { toolCalls: [{ id: "call_boom_1", name: "boom", args: {} }] },
      { content: "The tool failed, here is what happened." },
    ]);
    const { events, onEvent } = collect();

    const result = await runAgentLoop({ prompt: "Run the boom tool", tools: [boom], llmClient: llm, onEvent });
    const done = events.filter((e) => e.type === "tool.done");
    expect(done.length).toBe(1);
    expect(String(JSON.stringify((done[0].payload as any)?.result))).toContain("kaput");
    expect(events.some((e) => e.type === "agent.finish")).toBe(true);
    expect(result.status).toBe("completed");
  });
});

describe("Scenario F: consecutive tasks cannot inherit state", () => {
  it("second turn carries only its own prompt and catalog", async () => {
    const seen: string[] = [];
    const offeredPerCall: string[][] = [];
    const scripted: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            const lastUser = [...params.messages].reverse().find((m: any) => m.role === "user");
            const raw = lastUser?.content;
            const content =
              typeof raw === "string"
                ? raw
                : Array.isArray(raw)
                  ? String(raw.find((p: any) => p?.type === "text")?.text ?? "[multipart]")
                  : "[multipart]";
            seen.push(content);
            offeredPerCall.push(((params.tools || []) as Array<{ function: { name: string } }>).map((t) => t.function.name));
            return { choices: [{ message: { role: "assistant", content: "Done." } }] };
          },
        },
      },
    };
    const noop = () => {};
    await runAgentLoop({ prompt: "Search the web for go-to-market tips", llmClient: scripted, onEvent: noop });
    await runAgentLoop({
      prompt: "Add this background to my theme",
      attachments: [{ id: "a", name: "bg.png", type: "image/png", size: 10, dataUrl: "data:image/png;base64,AAA", isImage: true }],
      llmClient: scripted,
      onEvent: noop,
    });
    expect(seen[0]).toBe("Search the web for go-to-market tips");
    // Image turns prefix machine-readable attachment references; the user's
    // own prompt text must still pass through verbatim with no leakage.
    expect(seen[1]).toContain("attachmentId: a");
    expect(seen[1]).toContain("Add this background to my theme");
    expect(seen[1]).not.toContain("go-to-market");
    expect(offeredPerCall[0]).toContain("search_web");
    expect(offeredPerCall[1]).not.toContain("search_web");
    expect(offeredPerCall[1]).toContain("apply_theme");
  });
});

describe("apply_theme tool contract", () => {
  it("accepts an attachment reference and returns the theme action", async () => {
    const result = await apply_theme.execute({ attachmentId: "att-1", wallpaperFit: "cover" }, { step: 1 });
    expect((result as any).success).toBe(true);
    expect((result as any).action).toBe("theme.apply");
    expect((result as any).attachmentId).toBe("att-1");
  });

  it("rejects empty calls, bad URLs, and bad colors", async () => {
    for (const args of [{}, { wallpaperUrl: "ftp://x/y.jpg" }, { accentColor: "red" }]) {
      const parsed = (apply_theme as any).schema.safeParse(args);
      expect(parsed.success).toBe(false);
    }
  });
});

describe("theme.applied event adaptation", () => {
  it("maps the backend contract to the UI event", () => {
    const uiEvent = adaptBackendEvent({
      type: "theme.apply",
      step: 2,
      payload: { applied: { wallpaperFit: "cover" }, attachmentId: "att-9" },
    });
    expect(uiEvent?.type).toBe("theme.applied");
    if (uiEvent?.type === "theme.applied") {
      expect(uiEvent.applied).toEqual({ wallpaperFit: "cover" });
      expect(uiEvent.attachmentId).toBe("att-9");
    }
  });
});
