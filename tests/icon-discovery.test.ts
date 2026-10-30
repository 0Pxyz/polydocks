import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  searchCatalog,
  listCategories,
  isValidIconId,
  findCloseMatches,
} from "../server/icons/catalog";
import { search_icons } from "../server/agent/tools/search_icons";
import { list_icon_categories } from "../server/agent/tools/list_icon_categories";
import { create_tab } from "../server/agent/tools/create_tab";
import { update_tab } from "../server/agent/tools/update_tab";
import { create_plugin } from "../server/agent/tools/create_plugin";
import { modify_plugin } from "../server/agent/tools/modify_plugin";
import { runAgentLoop } from "../server/agent/loop";
import { defaultTools } from "../server/agent/tools";
import { readFeature } from "../server/workspace/features";

describe("icon catalog (server/icons/catalog.ts)", () => {
  it("exact id match ranks first", () => {
    const res = searchCatalog("atom", 5);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].id).toBe("atom");
  });

  it("keyword search finds purpose-based icons", () => {
    const ids = searchCatalog("flashcards study", 5).map((r) => r.id);
    expect(ids).toContain("flashcards");
    expect(ids).toContain("cards");
  });

  it("empty query returns the first N entries", () => {
    expect(searchCatalog("", 3)).toHaveLength(3);
    expect(searchCatalog("   ", 3)).toHaveLength(3);
  });

  it("respects the limit", () => {
    expect(searchCatalog("a", 4)).toHaveLength(4);
  });

  it("lists categories with counts summing to the full catalog", () => {
    const cats = listCategories();
    expect(cats.length).toBeGreaterThan(5);
    const total = cats.reduce((n, c) => n + c.count, 0);
    expect(total).toBe(searchCatalog("", 1000).length);
    expect(total).toBeGreaterThan(100);
  });

  it("accepts legacy separator variants like the dock adapter does", () => {
    expect(isValidIconId("Map-Pin")).toBe(true);
    expect(isValidIconId("map_pin")).toBe(true);
    expect(isValidIconId("Chart-Line-Up")).toBe(true);
    expect(searchCatalog("map-pin", 5).map((r) => r.id)).toContain("mappin");
  });

  it("validates ids case-insensitively", () => {
    expect(isValidIconId("cards")).toBe(true);
    expect(isValidIconId("Cards")).toBe(true);
    expect(isValidIconId(" CARDS ")).toBe(true);
    expect(isValidIconId("layers")).toBe(true);
    expect(isValidIconId("nope-not-an-icon")).toBe(false);
    expect(isValidIconId("")).toBe(false);
  });

  it("suggests close matches for typos", () => {
    expect(findCloseMatches("card", 4)).toContain("cards");
    expect(findCloseMatches("glober", 4)).toContain("globe");
    expect(findCloseMatches("zzz-no-match-zzz", 4).length).toBeLessThanOrEqual(4);
  });
});

describe("search_icons + list_icon_categories tools", () => {
  it("search_icons returns valid catalog ids", async () => {
    const res = (await search_icons.execute(
      { query: "music", limit: 5 },
      { step: 1 }
    )) as any;
    expect(res.query).toBe("music");
    expect(res.count).toBeLessThanOrEqual(5);
    expect(res.icons.length).toBe(res.count);
    for (const icon of res.icons) {
      expect(isValidIconId(icon.id)).toBe(true);
    }
    expect(res.icons.map((i: any) => i.id)).toContain("music");
  });

  it("list_icon_categories returns a non-empty category table", async () => {
    const res = (await list_icon_categories.execute({}, { step: 1 })) as any;
    expect(res.totalCategories).toBeGreaterThan(5);
    expect(res.categories.length).toBe(res.totalCategories);
  });
});

describe("icon validation on create/update", () => {
  it("create_tab accepts catalog ids and rejects unknown ones with a hint", () => {
    const base: any = {
      id: "icon-test",
      title: "Icon test",
      code: "export default function App() { return null; }",
    };
    expect(create_tab.schema.safeParse({ ...base, icon: "atom" }).success).toBe(true);
    const bad = create_tab.schema.safeParse({ ...base, icon: "not-a-real-icon" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const msg = bad.error.issues.map((i) => i.message).join(" ");
      expect(msg).toContain("not-a-real-icon");
      expect(msg).toContain("search_icons");
    }
  });

  it("create_tab keeps working defaults", () => {
    const parsed = create_tab.schema.safeParse({
      id: "icon-default",
      title: "Default icon",
      code: "export default function App() { return null; }",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(isValidIconId((parsed.data as any).icon)).toBe(true);
    }
  });

  it("update_tab rejects unknown icons", () => {
    const bad = update_tab.schema.safeParse({ id: "some-tab", icon: "bogus-icon-xyz" });
    expect(bad.success).toBe(false);
    expect(update_tab.schema.safeParse({ id: "some-tab", icon: "brain" }).success).toBe(true);
    expect(update_tab.schema.safeParse({ id: "some-tab", title: "No icon" }).success).toBe(true);
  });

  it("create_plugin rejects unknown icons", () => {
    const base: any = {
      id: "icon-plugin",
      name: "Icon plugin",
      description: "desc",
      code: "export default function App() { return null; }",
    };
    expect(create_plugin.schema.safeParse({ ...base, icon: "globe" }).success).toBe(true);
    const bad = create_plugin.schema.safeParse({ ...base, icon: "definitely-not-an-icon" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.map((i) => i.message).join(" ")).toContain("search_icons");
    }
  });

  it("modify_plugin rejects unknown metadata icons but allows icon-free patches", () => {
    const bad = modify_plugin.schema.safeParse({
      id: "some-plugin",
      icon: "nope-bogus",
      changeSummary: "icon tweak",
    });
    expect(bad.success).toBe(false);
    const ok = modify_plugin.schema.safeParse({
      id: "some-plugin",
      patch: { find: "a", replace: "b" },
      changeSummary: "text fix",
    });
    expect(ok.success).toBe(true);
  });
});

describe("agent discovers and uses icons end-to-end", () => {
  const TEST_CITY = "test-city-icon-discovery";
  const TEST_DIR = path.resolve(process.cwd(), "workspace", TEST_CITY);

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("loop: search_icons then create_tab with the discovered id", async () => {
    const discovered = searchCatalog("science lab", 3)[0].id;
    let step = 0;
    const started: string[] = [];
    const mockLlm: any = {
      chat: {
        completions: {
          create: async () => {
            step += 1;
            if (step === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      tool_calls: [
                        {
                          id: "call_icon_1",
                          type: "function",
                          function: {
                            name: "search_icons",
                            arguments: JSON.stringify({ query: "science lab", limit: 3 }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            if (step === 2) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      tool_calls: [
                        {
                          id: "call_tab_1",
                          type: "function",
                          function: {
                            name: "create_tab",
                            arguments: JSON.stringify({
                              id: "icon-e2e-tab",
                              title: "Icon E2E",
                              icon: discovered,
                              code: "export default function App() { return null; }",
                            }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return { choices: [{ message: { role: "assistant", content: "Tab ready." } }] };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Build a science lab tool with a fitting icon",
      cityId: TEST_CITY,
      origin: "chat",
      tools: [...defaultTools],
      llmClient: mockLlm,
      onEvent: (ev: any) => {
        if (ev.type === "tool.start") started.push(ev.payload?.name ?? ev.name);
      },
    });

    expect(result.status).toBe("completed");
    expect(started).toContain("search_icons");
    expect(started).toContain("create_tab");

    const feature = await readFeature(TEST_CITY, "icon-e2e-tab");
    expect(feature.manifest.icon).toBe(discovered.toLowerCase());
    expect(isValidIconId(feature.manifest.icon)).toBe(true);
  });
});
