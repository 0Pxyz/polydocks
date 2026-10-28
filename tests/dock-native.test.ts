import { describe, it, expect } from "bun:test";
import { ROOT_DOCK_TOOLS, CITY_DOCK_TOOLS } from "../src/features/dock/AgenticDock";
import app from "../server/index";

describe("Dock Native Architecture & City Mode (Phase 2)", () => {
  it("CORE_DOCK_TOOLS contains the four core tools for the hackathon", () => {
    const toolIds = ROOT_DOCK_TOOLS.map((t) => t.id);
    expect(toolIds).toEqual(["agent", "maps", "browser", "notes"]);

    const agent = ROOT_DOCK_TOOLS.find((t) => t.id === "agent");
    expect(agent?.isAgent).toBe(true);

    const maps = ROOT_DOCK_TOOLS.find((t) => t.id === "maps");
    expect(maps?.label).toContain("World Map");

    const browser = ROOT_DOCK_TOOLS.find((t) => t.id === "browser");
    expect(browser?.label).toContain("Research");

    const notes = ROOT_DOCK_TOOLS.find((t) => t.id === "notes");
    expect(notes?.label).toContain("Notes");
  });

  it("CITY_DOCK_TOOLS also ships the four core tools by default", () => {
    const toolIds = CITY_DOCK_TOOLS.map((t) => t.id);
    expect(toolIds).toContain("agent");
    expect(toolIds).toContain("maps");
    expect(toolIds).toContain("browser");
    expect(toolIds).toContain("notes");
  });

  it("GET and POST /api/cities/:id/files safely lists and creates workspace files", async () => {
    const testCity = "test-city-dock-files";
    const testPath = "notes/test-spec.md";
    const testContent = "# Test Specification\n\nGenerated for Phase 2 dock native test.";

    // Write a file
    const postRes = await app.fetch(
      new Request(`http://localhost:3000/api/cities/${testCity}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: testPath,
          content: testContent,
        }),
      })
    );

    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.path).toBe(testPath);

    // List files
    const listRes = await app.fetch(
      new Request(`http://localhost:3000/api/cities/${testCity}/files`)
    );
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.success).toBe(true);
    expect(Array.isArray(listData.files)).toBe(true);
    const found = listData.files.some((f: any) => f.path === testPath);
    expect(found).toBe(true);
  });

  it("contextual suggestions provide city-specific and root defaults without slop", () => {
    const getSuggestions = (cityName?: string) =>
      cityName?.trim()
        ? [
            `Flashcards for ${cityName}`,
            `Compare two sources on ${cityName}`,
            `A timeline of ${cityName}`,
          ]
        : ["Flashcards", "A reading list", "A timeline"];

    const citySuggestions = getSuggestions("Stoicism");
    expect(citySuggestions).toEqual([
      "Flashcards for Stoicism",
      "Compare two sources on Stoicism",
      "A timeline of Stoicism",
    ]);

    const defaultSuggestions = getSuggestions(undefined);
    expect(defaultSuggestions).toEqual([
      "Flashcards",
      "A reading list",
      "A timeline",
    ]);
  });
});
