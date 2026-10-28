import { describe, it, expect } from "bun:test";
import { ROOT_DOCK_TOOLS, CITY_DOCK_TOOLS } from "../src/features/dock/AgenticDock";
import app from "../server/index";

describe("Dock Native Architecture & City Mode (Phase 2)", () => {
  it("ROOT_DOCK_TOOLS contains only agent, maps, and settings initially", () => {
    const toolIds = ROOT_DOCK_TOOLS.map((t) => t.id);
    expect(toolIds).toEqual(["agent", "maps", "settings"]);

    const agent = ROOT_DOCK_TOOLS.find((t) => t.id === "agent");
    expect(agent?.isAgent).toBe(true);

    const maps = ROOT_DOCK_TOOLS.find((t) => t.id === "maps");
    expect(maps?.label).toContain("World Map");

    const settings = ROOT_DOCK_TOOLS.find((t) => t.id === "settings");
    expect(settings?.label).toContain("Settings");
  });

  it("CITY_DOCK_TOOLS contains world exit, agent, and city native tools", () => {
    const toolIds = CITY_DOCK_TOOLS.map((t) => t.id);
    expect(toolIds).toContain("world");
    expect(toolIds).toContain("agent");
    expect(toolIds).toContain("browser");
    expect(toolIds).toContain("files");
    expect(toolIds).toContain("notes");
    expect(toolIds).toContain("quests");
    expect(toolIds).toContain("terminal");
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
});
