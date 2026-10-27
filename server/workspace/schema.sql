-- Polymax Local SQLite Schema
-- High-concurrency WAL mode enabled in runtime

CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  region TEXT,
  level INTEGER DEFAULT 1,
  tags TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS city_tabs (
  id TEXT NOT NULL,
  city_id TEXT NOT NULL,
  title TEXT NOT NULL,
  icon TEXT DEFAULT 'Layers',
  scope TEXT DEFAULT 'city',
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, city_id)
);

CREATE TABLE IF NOT EXISTS city_notes (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS city_sources (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  kind TEXT DEFAULT 'web',
  cached_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discovery_cache (
  query_hash TEXT PRIMARY KEY,
  query_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
