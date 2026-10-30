import { describe, it, expect } from "bun:test";
import { INTENT_TOOL_DENYLIST, classifyIntent } from "../server/agent/intent";
import {
  isThemeIntent,
  selectDomainSkills,
  skillTokens,
  loadSkill,
  stripSkillMetadata,
} from "../server/agent/skills/index";
import { THREAD_CONTEXT_MAX_MESSAGES, THREAD_CONTEXT_TOKEN_BUDGET } from "../server/workspace/thread";
import { runAgentLoop } from "../server/agent/loop";
import { defaultTools, minimalTools } from "../server/agent/tools/index";

function mockLlm(capture: { system: string }) {
  return {
    chat: {
      completions: {
        create: async (params: any) => {
          capture.system = params.messages.find((m: any) => m.role === "system")?.content || "";
          return { choices: [{ message: { role: "assistant", content: "Hi there." } }] };
        },
      },
    },
  } as any;
}

const approxTokens = (s: string) => Math.ceil(s.length / 4);

describe("Issue #163 — progressive context and capability discovery", () => {
  it("pure conversational turns skip workspace context (fast path, measured)", async () => {
    const fastCapture = { system: "" };
    await runAgentLoop({ prompt: "hello", llmClient: mockLlm(fastCapture) });
    expect(fastCapture.system).not.toContain("Installed Plugins");
    expect(fastCapture.system).not.toContain("Mounted Plugins");
    expect(fastCapture.system).not.toContain("Recalled Agent Memory");
    // Fast path still carries the fixed core: base prompt + app map + guidelines.
    expect(fastCapture.system).toContain("Polymax Agent");
    expect(fastCapture.system).toContain("App Map");

    const fullCapture = { system: "" };
    await runAgentLoop({
      prompt: "pesquise os papers mais recentes sobre distributed systems",
      cityId: "distributed-systems",
      llmClient: mockLlm(fullCapture),
    });
    expect(fullCapture.system).toContain("Specialized Skill: content-and-reader");

    // Measured: fast path is strictly smaller than a workspace turn.
    expect(approxTokens(fastCapture.system)).toBeLessThan(approxTokens(fullCapture.system));
  });

  it("workspace/research/plugin scenarios keep working (golden paths)", async () => {
    // TikTok-style research request: discovery tools stay offered.
    const researchCapture = { system: "" };
    const researchLlm = {
      chat: {
        completions: {
          create: async (params: any) => {
            researchCapture.system = params.messages.find((m: any) => m.role === "system")?.content || "";
            const tools = (params.tools || []).map((t: any) => t.function.name);
            expect(tools).toContain("search_web");
            expect(tools).toContain("fetch_page");
            expect(tools).not.toContain("build_city");
            return { choices: [{ message: { role: "assistant", content: "Researching." } }] };
          },
        },
      },
    } as any;
    await runAgentLoop({ prompt: "find tiktok tutorials on sourdough", llmClient: researchLlm });
    expect(researchCapture.system).toContain("Specialized Skill: content-and-reader");

    // Pomodoro benchmark: creation tools stay offered on a general build ask.
    const buildLlm = {
      chat: {
        completions: {
          create: async (params: any) => {
            const tools = (params.tools || []).map((t: any) => t.function.name);
            expect(tools).toContain("create_plugin");
            expect(tools).toContain("find_capabilities");
            return { choices: [{ message: { role: "assistant", content: "Building." } }] };
          },
        },
      },
    } as any;
    await runAgentLoop({ prompt: "build a pomodoro timer", llmClient: buildLlm });

    // Theme request: theme skill injected, research/city tools hidden.
    const themeCapture = { system: "" };
    const themeLlm = {
      chat: {
        completions: {
          create: async (params: any) => {
            themeCapture.system = params.messages.find((m: any) => m.role === "system")?.content || "";
            const tools = (params.tools || []).map((t: any) => t.function.name);
            expect(tools).toContain("apply_theme");
            expect(tools).not.toContain("search_web");
            expect(tools).not.toContain("build_city");
            return { choices: [{ message: { role: "assistant", content: "Theming." } }] };
          },
        },
      },
    } as any;
    await runAgentLoop({ prompt: "change theme color to purple", llmClient: themeLlm });
    expect(themeCapture.system).toContain("Specialized Skill: theme");
  });

  it("denylists are minimal and contain no stale entries", () => {
    // No denylist may name a tool that does not exist.
    const known = new Set(defaultTools.map((t) => t.name));
    // Verb tools are also offerable (minimal surface).
    for (const t of minimalTools) known.add(t.name);
    for (const [intent, denied] of Object.entries(INTENT_TOOL_DENYLIST)) {
      for (const name of denied) {
        expect(known.has(name), `${intent} denylist names unknown tool ${name}`).toBe(true);
      }
    }

    // Research keeps discovery; city keeps planning; both block theme/delete.
    expect(INTENT_TOOL_DENYLIST.research).toContain("build_city");
    expect(INTENT_TOOL_DENYLIST.research).toContain("apply_theme");
    expect(INTENT_TOOL_DENYLIST.research).not.toContain("search_web");
    expect(INTENT_TOOL_DENYLIST.city).toContain("apply_theme");
    expect(INTENT_TOOL_DENYLIST.city).toContain("delete_tab");
    expect(INTENT_TOOL_DENYLIST.city).not.toContain("build_city");
    expect(INTENT_TOOL_DENYLIST.city).not.toContain("plan_map");

    // General conversation denies nothing: discovery always available.
    expect(INTENT_TOOL_DENYLIST.general).toEqual([]);
    expect(classifyIntent("hello")).toBe("general");
    expect(classifyIntent("what is quantum computing?")).toBe("general");
  });

  it("theme.md has a selector and stays within budget", async () => {
    expect(isThemeIntent("change theme color to purple")).toBe(true);
    expect(isThemeIntent("mude o papel de parede")).toBe(true);
    expect(isThemeIntent("add this background to my theme")).toBe(true);
    // Repairs outrank theme: a broken background is a fix, not a restyle.
    expect(isThemeIntent("fix the reader background")).toBe(false);
    expect(isThemeIntent("hello")).toBe(false);
    expect(selectDomainSkills("change theme color to purple")).toContain("theme");

    const theme = await loadSkill("theme");
    expect(skillTokens(theme)).toBeLessThanOrEqual(600);
    // All injected skills stay within per-skill budgets.
    for (const name of ["plugins", "dock-and-tabs", "dock", "theme", "capabilities-and-mcp", "content-and-reader", "world-and-cities", "memory-and-files", "verify-and-report"]) {
      expect(skillTokens(await loadSkill(name)), name).toBeLessThanOrEqual(600);
    }
    expect(skillTokens(await loadSkill("app-overview"))).toBeLessThanOrEqual(700);
  });

  it("no skill references nonexistent files or routes", async () => {
    // Every first-party skill.file reference resolves to a real skill file.
    const { searchPluginManifest } = await import("../server/plugins/first-party/index");
    const ref = (searchPluginManifest as any).skill?.file as string;
    expect(ref).toBeDefined();
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await expect(fs.readFile(path.resolve(process.cwd(), ref), "utf-8")).resolves.toContain("search");

    // Every loadable skill name resolves (web-research stays an explicit miss).
    for (const name of ["plugins", "dock-and-tabs", "dock", "theme", "capabilities-and-mcp", "content-and-reader", "world-and-cities", "memory-and-files", "verify-and-report", "app-overview"]) {
      await expect(loadSkill(name)).resolves.toBeDefined();
    }

    // dock.md routes exist on the app (facade is the default surface).
    const dockSkill = stripSkillMetadata(await loadSkill("dock"));
    expect(dockSkill).toContain("/api/dock/action");
    const { app } = await import("../server/index");
    expect((await app.request("/api/dock/tabs")).status).toBe(200);
  });

  it("prompt and context budgets are pinned", () => {
    // Thread window: 24 messages / 6000 tokens (rolling summary beyond).
    expect(THREAD_CONTEXT_MAX_MESSAGES).toBe(24);
    expect(THREAD_CONTEXT_TOKEN_BUDGET).toBe(6000);
  });
});
