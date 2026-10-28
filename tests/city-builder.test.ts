import { describe, it, expect } from "bun:test";
import { buildCityWorkspace } from "../server/city-builder/pipeline";
import type { CityBuildEvent, CityBuilderContext } from "../server/city-builder/types";
import { readCityFile } from "../server/workspace/cityWorkspace";

describe("Modular Staged City Builder Pipeline (server/city-builder)", () => {
  it("executes all 6 stages and emits progress events to city.ready", async () => {
    const events: CityBuildEvent[] = [];
    const testCityId = "test-city-neural";

    const mockTinyFish = {
      search: async (query: string) => [
        {
          title: `Foundations of ${query}`,
          url: "https://arxiv.org/abs/2301.00001",
          domainType: "research_paper" as const,
          snippet: "Deep learning fundamentals and optimization landscape.",
        },
        {
          title: `Comprehensive Guide to ${query}`,
          url: "https://example.com/guide",
          domainType: "web" as const,
          snippet: "A practical introduction to modern architectures.",
        },
      ],
      fetch: async (urls: string[]) =>
        urls.map((url) => ({
          url,
          markdown: `# Reference Article\n\nComprehensive analysis of ${url}`,
          status: 200,
        })),
    };

    const ctx: CityBuilderContext = {
      cityId: testCityId,
      topic: "Neural Networks",
      depth: "deep",
      tinyfish: mockTinyFish,
      emitEvent: (ev) => events.push(ev),
    };

    const bundle = await buildCityWorkspace(ctx);

    // Verify bundle output
    expect(bundle.cityId).toBe(testCityId);
    expect(bundle.topic).toBe("Neural Networks");
    expect(bundle.sources.length).toBeGreaterThanOrEqual(2);
    expect(bundle.concepts.length).toBe(3);
    expect(bundle.quests.length).toBe(3);
    expect(bundle.quests[0].tier).toBe("novice");
    expect(bundle.quests[1].tier).toBe("practitioner");
    expect(bundle.quests[2].tier).toBe("master");

    // Verify events were emitted in proper sequence
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("stage.start");
    expect(eventTypes).toContain("source.found");
    expect(eventTypes).toContain("concept.extracted");
    expect(eventTypes).toContain("quest.created");
    expect(eventTypes).toContain("city.ready");

    // Verify written workspace files
    const overviewMd = await readCityFile(testCityId, "notes/overview.md");
    expect(overviewMd).toBeDefined();
    expect(overviewMd).toContain("Neural Networks");

    const feedRaw = await readCityFile(testCityId, "feed.json");
    expect(feedRaw).toBeDefined();
    const feed = JSON.parse(feedRaw!);
    expect(feed.cityId).toBe(testCityId);

    const questsRaw = await readCityFile(testCityId, "quests/tree.json");
    expect(questsRaw).toBeDefined();
    const quests = JSON.parse(questsRaw!);
    expect(quests.length).toBe(3);
  });
});
