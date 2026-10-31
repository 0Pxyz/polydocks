import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

// Ensure data directory exists
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

const dbPath = path.join(config.DATA_DIR, "polymax.db");

/**
 * Primary SQLite database instance
 */
export const db = new Database(dbPath, { create: true });

// Enable Write-Ahead Logging (WAL) for high concurrency
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");

// Initialize schema
try {
  const schemaPath = path.join(import.meta.dir, "schema.sql");
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, "utf-8");
    db.exec(schemaSql);
  }
} catch (err: any) {
  console.error("[SQLite] Error initializing database schema:", err.message);
}

// One-way city retirement migration (existing databases only; fresh installs
// already match schema.sql). Renames scope columns with data preserved and
// drops parked city/world tables (the future/city-experience branch holds the
// code that reads them back). Workspace folders on disk are never touched.
try {
  const tables = new Set(
    (
      db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name)
  );
  const columnsOf = (table: string): Set<string> =>
    new Set(
      (db.query(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(
        (c) => c.name
      )
    );
  for (const table of ["sources", "audit_log", "executions", "experience_errors", "agent_thread_messages"]) {
    if (!tables.has(table)) continue;
    const cols = columnsOf(table);
    if (cols.has("workspace_id") && !cols.has("workspace_id")) {
      db.exec(`ALTER TABLE "${table}" RENAME COLUMN "workspace_id" TO "workspace_id"`);
    }
  }
  for (const table of [
    "cities",
    "city_tabs",
    "city_notes",
    "city_sources",
    "maps",
    "map_points",
    "city_conversations",
    "conversation_messages",
  ]) {
    if (tables.has(table)) db.exec(`DROP TABLE "${table}"`);
  }
} catch (err: any) {
  console.error("[SQLite] Error running city retirement migration:", err.message);
}
