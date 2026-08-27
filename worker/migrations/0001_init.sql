CREATE TABLE IF NOT EXISTS projects (
  id CHAR(36) PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  root_path VARCHAR(1024) NULL,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL,
  UNIQUE KEY projects_slug (slug)
);

CREATE TABLE IF NOT EXISTS context_entries (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  `key` VARCHAR(128) NOT NULL,
  body TEXT NOT NULL,
  provenance VARCHAR(500) NOT NULL,
  byte_length INT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  UNIQUE KEY context_project_key (project_id, `key`),
  CONSTRAINT context_project_fk FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS runs (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  goal TEXT NOT NULL,
  version INT NOT NULL,
  max_handoffs INT NOT NULL,
  max_revisions INT NOT NULL,
  max_context_bytes INT NOT NULL,
  max_context_items INT NOT NULL,
  handoff_count INT NOT NULL,
  revision_count INT NOT NULL,
  status_kind VARCHAR(32) NOT NULL,
  status_reason VARCHAR(64) NULL,
  finished_at_ms BIGINT NULL,
  created_at_ms BIGINT NOT NULL,
  CONSTRAINT runs_project_fk FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id CHAR(36) PRIMARY KEY,
  run_id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  outcome TEXT NOT NULL,
  acceptance TEXT NOT NULL,
  scope TEXT NOT NULL,
  verification TEXT NOT NULL,
  owner VARCHAR(80) NULL,
  status_kind VARCHAR(32) NOT NULL,
  status_note TEXT NULL,
  status_at_ms BIGINT NULL,
  version INT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  CONSTRAINT tasks_run_fk FOREIGN KEY (run_id) REFERENCES runs(id),
  CONSTRAINT tasks_project_fk FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  run_id CHAR(36) NOT NULL,
  task_id CHAR(36) NULL,
  kind VARCHAR(80) NOT NULL,
  uri VARCHAR(500) NOT NULL,
  summary TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  CONSTRAINT artifacts_project_fk FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT artifacts_run_fk FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  run_id CHAR(36) NOT NULL,
  bucket VARCHAR(32) NOT NULL,
  finding TEXT NOT NULL,
  rationale TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  CONSTRAINT decisions_project_fk FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT decisions_run_fk FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS events (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  run_id CHAR(36) NULL,
  type VARCHAR(64) NOT NULL,
  payload_json TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  CONSTRAINT events_project_fk FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_context_project ON context_entries (project_id, created_at_ms);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs (project_id, created_at_ms);
CREATE INDEX IF NOT EXISTS idx_tasks_run ON tasks (run_id, created_at_ms);
CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts (run_id, created_at_ms);
CREATE INDEX IF NOT EXISTS idx_decisions_run ON decisions (run_id, created_at_ms);
CREATE INDEX IF NOT EXISTS idx_events_project ON events (project_id, created_at_ms);
