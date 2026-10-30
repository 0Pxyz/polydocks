import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  close_tray,
  create_tab,
  defaultTools,
  delete_tab,
  fullTools,
  minimalTools,
  get_city_context,
  list_tabs,
  open_source,
  open_tab,
  read_city_file,
  update_tab,
  write_city_file,
} from "./index";
import { resolveSafeCityPath } from "../../workspace/cityWorkspace";

const TEST_CITY = "test-city-tools-catalog";
const TEST_DIR = path.resolve(process.cwd(), "workspace", TEST_CITY);

describe("Agent Tool Catalog & Security Guards", () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("should export all canonical tools in defaultTools catalog", () => {
    expect(defaultTools.length).toBe(62);
    const names = defaultTools.map((t) => t.name);
    expect(names).toContain("list_tabs");
    expect(names).toContain("open_tab");
    expect(names).toContain("open_intent");
    expect(names).toContain("enter_city");
    expect(names).toContain("inspect_tab");
    expect(names).toContain("close_tray");
    expect(names).toContain("dock_search");
    expect(names).toContain("dock_pin");
    expect(names).toContain("dock_unpin");
    expect(names).toContain("dock_close");
    expect(names).toContain("create_tab");
    expect(names).toContain("update_tab");
    expect(names).toContain("delete_tab");
    expect(names).toContain("get_city_context");
    expect(names).toContain("read_city_file");
    expect(names).toContain("write_city_file");
    expect(names).toContain("open_source");
    expect(names).toContain("plan_ascii_world");
    expect(names).toContain("search_web");
    expect(names).toContain("fetch_page");
    expect(names).toContain("plan_map");
    expect(names).toContain("build_city");
    expect(names).toContain("create_plugin");
    expect(names).toContain("modify_plugin");
    expect(names).toContain("operate_plugin");
    expect(names).toContain("publish_plugin");
    expect(names).toContain("list_maps");
    expect(names).toContain("set_map");
    expect(names).toContain("place_city");
    expect(names).toContain("find_capabilities");
    expect(names).toContain("invoke_capability");
    expect(names).toContain("inspect_experience");
    expect(names).toContain("promote_to_plugin");
    expect(names).toContain("inspect_execution");
    expect(names).toContain("list_recent_executions");
    expect(names).toContain("list_files");
    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("edit_file");
    expect(names).toContain("search_files");
    expect(names).toContain("recall_memory");
    expect(names).toContain("record_memory");
    expect(names).toContain("connect_cities");
    expect(names).toContain("apply_theme");
    expect(names).toContain("generate_image");
    expect(names).toContain("install_plugin");
    expect(names).toContain("rollback_plugin");
    expect(names).toContain("list_sessions");
    expect(names).toContain("inspect_session");
    expect(names).toContain("list_tasks");
    expect(names).toContain("list_artifacts");
    expect(names).toContain("read_artifact");
    expect(names).toContain("sandbox_exec");
    expect(names).toContain("sandbox_write_file");
    expect(names).toContain("sandbox_read_file");
    expect(names).toContain("sandbox_list_files");
    expect(names).toContain("sandbox_serve");
    expect(names).toContain("sandbox_logs");
    expect(names).toContain("sandbox_status");
    expect(names).toContain("sandbox_terminate");
  });
  it("minimal surface is the verb tools", () => {
    const names = minimalTools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "chat.toggle",
        "dock.background",
        "dock.close",
        "dock.focus",
        "dock.list",
        "dock.next",
        "dock.open",
        "dock.pin",
        "dock.prev",
        "dock.unpin",
        "plugins.create",
        "plugins.edit",
        "plugins.install",
        "plugins.operate",
        "plugins.rollback",
        "plugins.uninstall",
      ].sort()
    );
    // Full catalog is exactly the current 62 (default mode unchanged);
    // verb tools live only in the minimal surface.
    expect(fullTools.length).toBe(62);
    expect(fullTools.map((t) => t.name)).not.toContain("dock.open");
  });

  it("list_tabs returns builtins and dynamic tabs", async () => {
    const res = (await list_tabs.execute({}, { cityId: TEST_CITY, step: 1 })) as any;
    expect(res.builtin.length).toBe(5);
    expect(Array.isArray(res.dynamic)).toBe(true);
  });

  it("open_tab and close_tray return tray action contracts", async () => {
    const openRes = (await open_tab.execute({ tabId: "notes" }, { cityId: TEST_CITY, step: 1 })) as any;
    expect(openRes.action).toBe("tray.open");
    expect(openRes.tabId).toBe("notes");

    const closeRes = (await close_tray.execute({}, { cityId: TEST_CITY, step: 1 })) as any;
    expect(closeRes.action).toBe("tray.close");
  });

  it("write_city_file and read_city_file safely persist files in city folder", async () => {
    await write_city_file.execute(
      { path: "notes/sample.md", content: "# Hello City\nThis is a test note." },
      { cityId: TEST_CITY, step: 1 }
    );

    const readRes = (await read_city_file.execute(
      { path: "notes/sample.md" },
      { cityId: TEST_CITY, step: 1 }
    )) as any;

    expect(readRes.content).toContain("# Hello City");
  });

  it("create_tab, update_tab, and delete_tab manage dynamic micro-app lifecycle", async () => {
    // 1. Create
    const createRes = (await create_tab.execute(
      {
        id: "flashcards",
        title: "Flashcards",
        html: "<!DOCTYPE html><html><body><h1>Flashcards</h1></body></html>",
      },
      { cityId: TEST_CITY, step: 1 }
    )) as any;

    expect(createRes.action).toBe("tab.created");
    expect(createRes.tab.id).toBe("flashcards");

    // 2. Update
    const updateRes = (await update_tab.execute(
      {
        id: "flashcards",
        title: "Updated Flashcards",
      },
      { cityId: TEST_CITY, step: 2 }
    )) as any;

    expect(updateRes.tab.title).toBe("Updated Flashcards");

    // 3. Delete without approval must be paused
    const deletePaused = (await delete_tab.execute(
      { id: "flashcards", userApproved: false },
      { cityId: TEST_CITY, step: 3 }
    )) as any;

    expect(deletePaused.status).toBe("approval_required");

    // 4. Delete with approval succeeds
    const deleteDone = (await delete_tab.execute(
      { id: "flashcards", userApproved: true },
      { cityId: TEST_CITY, step: 4 }
    )) as any;

    expect(deleteDone.action).toBe("tab.deleted");
  });

  it("open_source validates URLs", async () => {
    const res = (await open_source.execute(
      { url: "https://arxiv.org/abs/2301.12345", title: "arXiv Paper" },
      { cityId: TEST_CITY, step: 1 }
    )) as any;

    expect(res.action).toBe("browser.open");
    expect(res.url).toBe("https://arxiv.org/abs/2301.12345");
  });

  it("get_city_context returns complete city inventory", async () => {
    const ctx = (await get_city_context.execute({}, { cityId: TEST_CITY, step: 1 })) as any;
    expect(ctx.cityId).toBe(TEST_CITY);
    expect(Array.isArray(ctx.notes)).toBe(true);
    expect(ctx.notes).toContain("sample.md");
  });

  it("strictly rejects path traversal attacks", async () => {
    expect(
      resolveSafeCityPath(TEST_CITY, "../../etc/passwd")
    ).rejects.toThrow(/Security Violation/);

    expect(
      resolveSafeCityPath("..", "notes.md")
    ).rejects.toThrow(/Security Violation/);
  });

  it("plan_map synthesizes semantic knowledge regions and cities", async () => {
    const { plan_map } = await import("./plan_map");
    const result = (await plan_map.execute(
      { interests: ["Quantum Computing", "Philosophy"] },
      { cityId: TEST_CITY, step: 1 }
    )) as any;

    expect(result.success).toBe(true);
    expect(result.regionCount).toBe(2);
    expect(result.cityCount).toBe(4);
    expect(result.spec.regions[0].title).toBe("Quantum Computing");
  });

  it("build_city tool executes pipeline and constructs workspace assets", async () => {
    const { build_city } = await import("./build_city");
    const result = (await build_city.execute(
      { cityId: TEST_CITY, topic: "Distributed Systems", depth: "overview" },
      { cityId: TEST_CITY, step: 1 }
    )) as any;

    expect(result.success).toBe(true);
    expect(result.topic).toBe("Distributed Systems");
    expect(result.status).toBe("ready");
    expect(result.questsCount).toBe(3);
  }, 30000);

  it("list_maps, set_map, and place_city tools manage Maps v2 world cartography", async () => {
    const { list_maps } = await import("./list_maps");
    const { set_map } = await import("./set_map");
    const { place_city } = await import("./place_city");

    // 1. list_maps
    const listRes = (await list_maps.execute({}, { cityId: TEST_CITY, step: 1 })) as any;
    expect(listRes.maps.length).toBeGreaterThanOrEqual(4);
    expect(listRes.maps.some((m: any) => m.id === "gloom")).toBe(true);

    // 2. set_map
    const setRes = (await set_map.execute({ mapId: "ancient" }, { cityId: TEST_CITY, step: 2 })) as any;
    expect(setRes.action).toBe("map.changed");
    expect(setRes.mapId).toBe("ancient");

    // 3. place_city refuses cities that were never built (never silently confirms)
    const missing = (await place_city.execute(
      { title: "No Such City XYZ", mapId: "gloom" },
      { cityId: TEST_CITY, step: 3 }
    )) as any;

    expect(missing.error).toContain("No Such City XYZ");
    expect(missing.retryable).toBe(true);
    expect(missing.action).toBeUndefined();

    // 4. place_city pins and re-reads for a registered city
    const { db } = await import("../../workspace/db");
    db.query(
      "INSERT OR REPLACE INTO cities (id, title, region, level, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("city-test-cartography", "Test Cartography", "Core Region", 1, "[]", Math.floor(Date.now() / 1000));
    try {
      const placeRes = (await place_city.execute(
        { title: "Test Cartography", mapId: "gloom" },
        { cityId: TEST_CITY, step: 4 }
      )) as any;

      expect(placeRes.action).toBe("map.point.added");
      expect(placeRes.cityId).toBe("city-test-cartography");
      expect(typeof placeRes.pointId).toBe("string");
      expect(placeRes.x).toBeGreaterThan(0);
      expect(placeRes.y).toBeGreaterThan(0);
      const stored = db
        .query("SELECT id FROM map_points WHERE id = ?")
        .get(placeRes.pointId) as { id: string } | null;
      expect(stored?.id).toBe(placeRes.pointId);
    } finally {
      db.query("DELETE FROM map_points WHERE city_id = ?").run("city-test-cartography");
      db.query("DELETE FROM cities WHERE id = ?").run("city-test-cartography");
    }
  });
});
