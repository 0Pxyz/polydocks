-- Polymax Local SQLite Schema
-- High-concurrency WAL mode enabled in runtime

-- Unified enriched source store (contract plugin `sources`). Replaces the
-- three legacy shapes: workspace/sources/* filenames, hand-written
-- feed.json items and pipeline feed.json items. The agent passes a URL;
-- the server enriches and validates.
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'article',
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  site TEXT,
  image TEXT,
  author TEXT,
  published_at TEXT,
  read_minutes INTEGER,
  duration_sec INTEGER,
  hook TEXT,
  full_text TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, url)
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
  workspace_id TEXT,
  actor TEXT DEFAULT 'user', -- 'agent' | 'user' | 'cli'
  action TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
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
  workspace_id TEXT,
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
  workspace_id TEXT NOT NULL,
  message TEXT NOT NULL,
  filename TEXT,
  lineno INTEGER,
  colno INTEGER,
  stack TEXT,
  created_at TEXT NOT NULL
);

-- Single persistent agent thread per user
-- One transcript per user, independent of the active workspace or the current view.
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
  workspace_id TEXT,
  attachments_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES agent_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_thread_messages_thread_seq
  ON agent_thread_messages(thread_id, seq);

CREATE TABLE IF NOT EXISTS session_transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  entry_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_transcripts_session_id ON session_transcripts(session_id);

-- Agent sandbox identity (Modal). One row per workspace: the sandbox id,
-- volume and preview live here; product data stays in workspace tables.
-- Sandboxes and volumes are disposable — this row is only a pointer.
CREATE TABLE IF NOT EXISTS workspace_sandboxes (
  workspace_id TEXT PRIMARY KEY,
  sandbox_id TEXT NOT NULL,
  name TEXT NOT NULL,
  volume TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  preview_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- PolyDocks V2 Multi-Workspace Architecture

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'Briefcase',
  kind TEXT NOT NULL DEFAULT 'workspace',
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

-- Dock pins: server record of pinned items per workspace scope.
-- The client keeps its own pin cache; this table is the durable truth
-- the agent, CLI and routes share (pin persists across sessions).
CREATE TABLE IF NOT EXISTS dock_pins (
  workspace_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  pinned_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, item_id)
);

-- Dock items: durable single source for dock state.
-- One row per dock item (plugin). context_id is opaque (null = global).
CREATE TABLE IF NOT EXISTS dock_items (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  context_id TEXT,
  state TEXT NOT NULL DEFAULT 'closed',
  item_order INTEGER NOT NULL DEFAULT 0,
  panel TEXT,
  updated_at TEXT NOT NULL
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
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'running' | 'completed' (=succeeded) | 'failed' | 'cancelled' | 'interrupted'
  progress REAL DEFAULT 0.0,
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Durable job event log (SSE resume via Last-Event-ID; survives restarts)
CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_session_id ON job_events(session_id, id);

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



