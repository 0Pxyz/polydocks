import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  close_tray,
  create_tab,
  defaultTools,
  delete_tab,
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

  it("should export all 10 canonical tools in defaultTools catalog", () => {
    expect(defaultTools.length).toBe(10);
    const names = defaultTools.map((t) => t.name);
    expect(names).toContain("list_tabs");
    expect(names).toContain("open_tab");
    expect(names).toContain("close_tray");
    expect(names).toContain("create_tab");
    expect(names).toContain("update_tab");
    expect(names).toContain("delete_tab");
    expect(names).toContain("get_city_context");
    expect(names).toContain("read_city_file");
    expect(names).toContain("write_city_file");
    expect(names).toContain("open_source");
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
});
