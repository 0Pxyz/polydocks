import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import {
  deleteCityFile,
  getCityContext,
  readCityFile,
  resolveSafeCityPath,
  writeCityFile,
} from "./cityWorkspace";

const TEST_CITY = "test-sqlite-workspace";
const TEST_DIR = path.resolve(process.cwd(), "workspace", TEST_CITY);

describe("City Workspace & SQLite Engine", () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("SQLite database initializes with tables and WAL mode", () => {
    const journalMode = db.query("PRAGMA journal_mode;").get() as any;
    expect(journalMode.journal_mode.toLowerCase()).toBe("wal");

    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table';")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("cities");
    expect(tableNames).toContain("city_tabs");
    expect(tableNames).toContain("city_notes");
    expect(tableNames).toContain("city_sources");
    expect(tableNames).toContain("discovery_cache");
  });

  it("safely writes, reads, and deletes files in city workspace", async () => {
    await writeCityFile(TEST_CITY, "notes/test.md", "# Test Content");
    const content = await readCityFile(TEST_CITY, "notes/test.md");
    expect(content).toBe("# Test Content");

    await deleteCityFile(TEST_CITY, "notes/test.md");
    expect(readCityFile(TEST_CITY, "notes/test.md")).rejects.toThrow();
  });

  it("correctly extracts city context including layout and files", async () => {
    await writeCityFile(
      TEST_CITY,
      "city.json",
      JSON.stringify({ id: TEST_CITY, title: "Test City", level: 2 })
    );
    await writeCityFile(
      TEST_CITY,
      "workspace.json",
      JSON.stringify({ activeTab: "browser", openSources: [] })
    );
    await writeCityFile(TEST_CITY, "notes/alpha.md", "Alpha note");
    await writeCityFile(TEST_CITY, "tabs/quiz/index.html", "<h1>Quiz</h1>");

    const ctx = await getCityContext(TEST_CITY);
    expect(ctx.cityId).toBe(TEST_CITY);
    expect(ctx.metadata?.title).toBe("Test City");
    expect(ctx.workspace?.activeTab).toBe("browser");
    expect(ctx.notes).toContain("alpha.md");
    expect(ctx.tabs).toContain("quiz");
  });

  it("strictly prevents path traversal attacks outside city folder", async () => {
    expect(resolveSafeCityPath(TEST_CITY, "../outside.txt")).rejects.toThrow(
      /Security Violation/
    );

    expect(
      resolveSafeCityPath(TEST_CITY, "notes/../../../etc/passwd")
    ).rejects.toThrow(/Security Violation/);

    expect(resolveSafeCityPath("..", "attack.txt")).rejects.toThrow(
      /Security Violation/
    );
  });
});
