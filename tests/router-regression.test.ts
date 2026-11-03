import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { KeywordRouter, type RouterState } from "../server/agent/orchestrator";
import { verifyJobEffect } from "../server/agent/taskRunner";
import { apply_theme } from "../server/agent/tools/apply_theme";
import { updateTaskState } from "../server/agent/taskRunner";
import { createSession } from "../server/agent/taskRunner";
import { listJobEvents } from "../server/workspace/sessions";
import { db } from "../server/workspace/db";

const router = new KeywordRouter();
const DOCK = ["agent", "browser", "plugins", "creations", "store", "settings", "onboarding", "bitcoin"];
const st = (over: Partial<RouterState> = {}): RouterState => ({
  workspaceId: "default",
  sessionId: "s",
  dockIds: DOCK,
  activeTasks: [],
  ...over,
});

describe("Router regression: theme/wallpaper never becomes a background job", () => {
  it("routes the reported prompt to the fast agent, not create_tool", () => {
    const r = router.route(
      "Change my workspace theme to something that complements this background, and add this GIF as my workspace background: https://media.giphy.com/media/x/giphy.gif",
      st()
    );
    expect(r.kind).toBe("answer_quick");
  });

  it("keeps appearance asks on the quick path", () => {
    expect(router.route("muda o tema para escuro", st()).kind).toBe("answer_quick");
    expect(router.route("troca o fundo para esta imagem https://example.com/a.jpg", st()).kind).toBe("answer_quick");
    expect(router.route("cria um tema novo para a dock", st()).kind).toBe("answer_quick");
  });

  it("still routes explicit builds to create_tool", () => {
    expect(router.route("cria um plugin de pomodoro", st()).kind).toBe("create_tool");
    expect(router.route("build a timer widget", st()).kind).toBe("create_tool");
    expect(router.route("Create a dashboard tool for my tasks", st()).kind).toBe("create_tool");
    expect(router.route("escreve um script que renomeia arquivos", st()).kind).toBe("create_tool");
  });

  it("opens known surfaces by alias and rejects unknown ids", () => {
    const open = router.route("open my tools", st());
    expect(open.kind).toBe("dock_action");
    expect(open.args).toEqual({ dockOp: "open", dockId: "plugins" });

    const close = router.route("fecha o browser", st());
    expect(close.kind).toBe("dock_action");
    expect(close.args?.dockId).toBe("browser");

    const meh = router.route("open usage monitor", st());
    expect(meh.kind).toBe("dock_action");
    expect(meh.args?.dockId).toBe("usage monitor");
    expect(DOCK.includes(meh.args?.dockId ?? "")).toBe(false);
  });

  it("flags note-like open targets for model escalation, not dock ids (#402)", async () => {
    const { isNoteOpenRequest } = await import("../server/agent/orchestrator");
    expect(isNoteOpenRequest('Open my note titled "weekly plan"')).toBe(true);
    expect(isNoteOpenRequest("abre minha nota de estudos")).toBe(true);
    expect(isNoteOpenRequest("open my tools")).toBe(false);
    expect(isNoteOpenRequest("open usage monitor")).toBe(false);
    expect(isNoteOpenRequest("open my keynote")).toBe(false);
  });
});

describe("Honest job completion", () => {
  it("fails jobs with zero tool calls instead of announcing Done", () => {
    expect(verifyJobEffect({ type: "plugin_synthesis", toolCalls: 0, pluginTouched: false }).ok).toBe(false);
    expect(verifyJobEffect({ type: "research", toolCalls: 0, pluginTouched: false }).ok).toBe(false);
  });

  it("fails synthesis that registered nothing", () => {
    const r = verifyJobEffect({ type: "plugin_synthesis", toolCalls: 4, pluginTouched: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("plugin");
  });

  it("passes real work through", () => {
    expect(verifyJobEffect({ type: "plugin_synthesis", toolCalls: 4, pluginTouched: true }).ok).toBe(true);
    expect(verifyJobEffect({ type: "research", toolCalls: 2, pluginTouched: false }).ok).toBe(true);
  });

  it("carries the real output summary on job.completed, never just the prompt", () => {
    const session = createSession({ workspaceId: "ws-honest", title: "t" });
    db.query(
      "INSERT INTO tasks (id, session_id, workspace_id, type, status, created_at, updated_at) VALUES (?, ?, ?, 'research', 'queued', ?, ?)"
    ).run("honest-t1", session.id, "ws-honest", new Date().toISOString(), new Date().toISOString());
    updateTaskState("honest-t1", "running");
    updateTaskState("honest-t1", "completed", { output: { text: "Found 3 papers about raft." } });
    const events = listJobEvents({ jobId: "honest-t1" });
    const completed = events.find((e) => e.type === "job.completed");
    expect(completed).toBeDefined();
    expect(String((completed!.payload as any)?.summary || "")).toContain("raft");
    db.query("DELETE FROM job_events WHERE job_id = ?").run("honest-t1");
    db.query("DELETE FROM tasks WHERE id = ?").run("honest-t1");
    db.query("DELETE FROM sessions WHERE id = ?").run(session.id);
  });
});

describe("apply_theme validates the wallpaper URL", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    (globalThis as any).fetch = realFetch;
  });
  function mockFetch(handler: (url: string) => Response) {
    (globalThis as any).fetch = async (url: any) => handler(String(url));
  }
  const img = (type = "image/gif") =>
    new Response("GIF89a", { status: 200, headers: { "content-type": type } });

  it("accepts a reachable image URL", async () => {
    let seen = "";
    mockFetch((url) => {
      seen = url;
      return img();
    });
    const out = (await apply_theme.execute({ wallpaperUrl: "https://media.giphy.com/media/x/giphy.gif", theme: "cyber" } as any, {} as any)) as any;
    expect(seen).toContain("giphy");
    expect(out.success).toBe(true);
    expect(out.applied.wallpaperUrl).toContain("giphy");
  });

  it("rejects unreachable URLs without applying anything", async () => {
    mockFetch(() => new Response("nope", { status: 404 }));
    const out = (await apply_theme.execute({ wallpaperUrl: "https://example.com/missing.gif" } as any, {} as any)) as any;
    expect(out.success).toBe(false);
    expect(out.code).toBe("wallpaper_unreachable");
    expect(out.applied).toBeUndefined();
  });

  it("rejects non-image content", async () => {
    mockFetch(() => img("text/html"));
    const out = (await apply_theme.execute({ wallpaperUrl: "https://example.com/page" } as any, {} as any)) as any;
    expect(out.success).toBe(false);
    expect(out.code).toBe("wallpaper_not_image");
  });

  it("blocks private targets without touching the network", async () => {
    let called = false;
    mockFetch(() => {
      called = true;
      return img();
    });
    const out = (await apply_theme.execute({ wallpaperUrl: "http://127.0.0.1:8000/wall.png" } as any, {} as any)) as any;
    expect(out.success).toBe(false);
    expect(out.code).toBe("unsafe_url");
    expect(called).toBe(false);
  });
});
