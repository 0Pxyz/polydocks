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
