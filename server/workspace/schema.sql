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
  actor TEXT DEFAULT 'user', -- 'agent' | 'user' | 'cli'
  action TEXT NOT NULL,
  target_id TEXT,
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

CREATE TABLE IF NOT EXISTS city_conversations (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(city_id)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  city_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system' | 'tool'
  content TEXT NOT NULL,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES city_conversations(id) ON DELETE CASCADE
);

-- Single persistent agent thread per user
-- One transcript per user, independent of the active city or the current view.
-- Older turns are folded into a rolling summary so the model never reloads the whole history.

CREATE TABLE IF NOT EXISTS agent_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  title TEXT,
  summary TEXT,
  summary_through_seq INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_thread_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  city_id TEXT,
  attachments_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES agent_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_thread_messages_thread_seq
  ON agent_thread_messages(thread_id, seq);

-- PolyDocks V2 Multi-Workspace Architecture

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'Briefcase',
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_plugins (
  workspace_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  position INTEGER DEFAULT 0,
  settings_json TEXT,
  installed_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, plugin_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS registry_plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT DEFAULT 'Cards',
  version TEXT NOT NULL,
  author TEXT DEFAULT 'Community',
  tags_json TEXT,
  manifest_json TEXT NOT NULL,
  code TEXT NOT NULL,
  downloads INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Persistent Work Sessions & Background Task Engine (Issue #76)

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'completed' | 'archived'
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'chat' | 'plugin_synthesis' | 'research' | 'background_worker'
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
  progress REAL DEFAULT 0.0,
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Idempotency & Unified Service Layer (Issue #77)

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target_id TEXT,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);

CREATE TABLE IF NOT EXISTS plugin_files (
  workspace_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  manifest_json TEXT NOT NULL,
  source_code TEXT,
  srcdoc TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, plugin_id, version)
);

CREATE INDEX IF NOT EXISTS idx_plugin_files_lookup
  ON plugin_files(workspace_id, plugin_id);

CREATE TABLE IF NOT EXISTS plugin_versions (
  plugin_id TEXT NOT NULL,
  version TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  manifest_json TEXT NOT NULL,
  source_code TEXT,
  srcdoc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  PRIMARY KEY (plugin_id, version)
);

CREATE INDEX IF NOT EXISTS idx_plugin_versions_lookup
  ON plugin_versions(plugin_id, status);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  session_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'document' | 'code' | 'diagram' | 'data' | 'other'
  path TEXT,
  content TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_workspace_id ON artifacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_session_id ON artifacts(session_id);



