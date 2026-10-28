import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { open_intent } from "./open_intent";
import { inspect_tab } from "./inspect_tab";
import { getWorkspaceState } from "../../workspace/cityWorkspace";
import { runAgentLoop } from "../loop";

const TEST_CITY = "test-city-open-intents";
const TEST_DIR = path.resolve(process.cwd(), "workspace", TEST_CITY);

describe("Open Intents Engine & Tab State Inspection", () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("materializes study flow intent: opens Browser primed with course & attaches quest XP", async () => {
    const studyUrl = "https://example.com/tutorials/quantum-superposition";
    const res = (await open_intent.execute(
      {
        tabId: "browser",
        cityId: TEST_CITY,
        url: studyUrl,
        payload: {
          kind: "tutorial",
          title: "Introduction to Superposition & Qubits",
          questId: "quest-quantum-101",
          xp: 150,
        },
      },
      { cityId: TEST_CITY, step: 1 }
    )) as any;

    expect(res.success).toBe(true);
    expect(res.action).toBe("tab.prime");
    expect(res.trayAction).toBe("tray.open");
    expect(res.tabId).toBe("browser");
    expect(res.url).toBe(studyUrl);
    expect(res.payload?.questId).toBe("quest-quantum-101");

    // Verify persisted workspace.json state
    const state = await getWorkspaceState(TEST_CITY);
    expect(state.activeTab).toBe("browser");
    expect(state.currentURL).toBe(studyUrl);
    expect(state.activeQuestId).toBe("quest-quantum-101");
    expect(state.openSources?.length).toBeGreaterThan(0);
    expect(state.openSources?.[0].url).toBe(studyUrl);
    expect(state.openSources?.[0].title).toBe("Introduction to Superposition & Qubits");
  });

  it("materializes work flow intent: primes Notes tab with target markdown path", async () => {
    const notePath = "notes/quantum-notes.md";
    // Create note file first
    await fs.mkdir(path.join(TEST_DIR, "notes"), { recursive: true });
    await fs.writeFile(path.join(TEST_DIR, notePath), "# Quantum Notes", "utf-8");

    const res = (await open_intent.execute(
      {
        tabId: "notes",
        cityId: TEST_CITY,
        url: notePath,
        payload: {
          kind: "notes",
          title: "Superposition Field Notes",
          targetPath: notePath,
        },
      },
      { cityId: TEST_CITY, step: 2 }
    )) as any;

    expect(res.success).toBe(true);
    expect(res.tabId).toBe("notes");
    expect(res.url).toBe(notePath);

    const state = await getWorkspaceState(TEST_CITY);
    expect(state.activeTab).toBe("notes");
    expect(state.lastIntent?.tabId).toBe("notes");
  });

  it("strictly enforces untrusted URL and path traversal security guards", async () => {
    // 1. Rejects dangerous javascript: protocol
    await expect(
      open_intent.execute(
        {
          tabId: "browser",
          cityId: TEST_CITY,
          url: "javascript:alert(document.cookie)",
        },
        { cityId: TEST_CITY, step: 3 }
      )
    ).rejects.toThrow("Security Violation: Unsafe URL protocol");

    // 2. Rejects data: URI injection
    await expect(
      open_intent.execute(
        {
          tabId: "browser",
          cityId: TEST_CITY,
          url: "data:text/html,<script>steal()</script>",
        },
        { cityId: TEST_CITY, step: 3 }
      )
    ).rejects.toThrow("Security Violation: Unsafe URL protocol");

    // 3. Rejects path traversal outside city folder
    await expect(
      open_intent.execute(
        {
          tabId: "files",
          cityId: TEST_CITY,
          url: "../../etc/shadow",
        },
        { cityId: TEST_CITY, step: 3 }
      )
    ).rejects.toThrow("Security Violation");
  });

  it("inspects tab and workspace state via inspect_tab", async () => {
    // 1. Inspect entire city workspace state
    const overall = (await inspect_tab.execute({}, { cityId: TEST_CITY, step: 4 })) as any;
    expect(overall.cityId).toBe(TEST_CITY);
    expect(overall.activeTab).toBe("notes");
    expect(Array.isArray(overall.openSources)).toBe(true);

    // 2. Inspect specific builtin tab
    const browserTab = (await inspect_tab.execute(
      { tabId: "browser" },
      { cityId: TEST_CITY, step: 5 }
    )) as any;
    expect(browserTab.tabId).toBe("browser");
    expect(browserTab.kind).toBe("builtin");
    expect(browserTab.isActive).toBe(false); // activeTab is notes
  });

  it("emits SSE tray.open and tab.prime events through runAgentLoop", async () => {
    const emittedEvents: Array<{ type: string; payload?: any }> = [];

    // Mock LLM client simulating open_intent tool call
    const mockLlmClient = {
      chat: {
        completions: {
          create: async (params: any) => {
            if (params.messages.length === 2) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      tool_calls: [
                        {
                          id: "call_open_intent_1",
                          type: "function",
                          function: {
                            name: "open_intent",
                            arguments: JSON.stringify({
                              tabId: "browser",
                              url: "https://arxiv.org/abs/quant-ph/0201082",
                              payload: {
                                kind: "paper",
                                title: "Quantum Teleportation",
                                questId: "quest-arxiv-42",
                              },
                            }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "I have opened the Quantum Teleportation paper in the Browser dock tab.",
                  },
                },
              ],
            };
          },
        },
      },
    } as any;

    const res = await runAgentLoop({
      prompt: "Open the paper about quantum teleportation",
      cityId: TEST_CITY,
      llmClient: mockLlmClient,
      onEvent: (evt) => {
        emittedEvents.push({ type: evt.type, payload: evt.payload });
      },
    });

    expect(res.status).toBe("completed");
    const trayOpenEvt = emittedEvents.find((e) => e.type === "tray.open");
    const tabPrimeEvt = emittedEvents.find((e) => e.type === "tab.prime");

    expect(trayOpenEvt).toBeDefined();
    expect(trayOpenEvt?.payload?.tabId).toBe("browser");

    expect(tabPrimeEvt).toBeDefined();
    expect(tabPrimeEvt?.payload?.tabId).toBe("browser");
    expect(tabPrimeEvt?.payload?.url).toBe("https://arxiv.org/abs/quant-ph/0201082");
    expect(tabPrimeEvt?.payload?.payload?.questId).toBe("quest-arxiv-42");
  });
});
