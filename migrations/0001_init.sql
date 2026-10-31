PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','premium','business')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  limits_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO plans (id,name,monthly_price_cents,limits_json,created_at) VALUES
('free','Free',0,'{"pages":1,"qr_codes":5,"products":10,"forms":2,"invoices_per_month":5,"storage_mb":50}',unixepoch()*1000),
('premium','Premium',59000,'{"pages":-1,"qr_codes":-1,"products":100,"forms":20,"invoices_per_month":100,"storage_mb":2048}',unixepoch()*1000),
('business','Business',129000,'{"pages":-1,"qr_codes":-1,"products":-1,"forms":100,"invoices_per_month":500,"storage_mb":10240}',unixepoch()*1000);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','admin','member')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id,user_id)
);

CREATE TABLE IF NOT EXISTS usage_counters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  period_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id,metric,period_key)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
