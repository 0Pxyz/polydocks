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

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  style TEXT NOT NULL,
  kind TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_width INTEGER NOT NULL,
  image_height INTEGER NOT NULL,
  thumbnail_url TEXT NOT NULL,
  regions_json TEXT,
  sites_json TEXT,
  license TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS map_points (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  city_id TEXT NOT NULL,
  title TEXT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  status TEXT DEFAULT 'discovered',
  created_at TEXT NOT NULL,
  UNIQUE(map_id, city_id)
);

-- Core Plugin Architecture & Capability Bus

CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  trust TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plugin_grants (
  grant_id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  permission_type TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL, -- 'allow_once' | 'allow_always' | 'denied'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS executions (
  execution_id TEXT PRIMARY KEY,
  capability_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  actor TEXT NOT NULL, -- 'agent' | 'user'
  city_id TEXT,
  status TEXT NOT NULL, -- 'running' | 'success' | 'failed' | 'denied'
  duration_ms INTEGER DEFAULT 0,
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_errors (
  id TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL,
  city_id TEXT NOT NULL,
  message TEXT NOT NULL,
  filename TEXT,
  lineno INTEGER,
  colno INTEGER,
  stack TEXT,
  created_at TEXT NOT NULL
);




