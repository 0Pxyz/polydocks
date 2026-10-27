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
