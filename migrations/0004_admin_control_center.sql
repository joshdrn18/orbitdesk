PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_limit_overrides (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  limits_json TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_settings (
  tool_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO tool_settings (tool_key,name,description,enabled,updated_at) VALUES
('pages','My Pages','Create and manage shareable short links.',1,unixepoch()*1000),
('bio_pages','Bio Pages','Create a public profile with all important links.',1,unixepoch()*1000),
('qr_studio','QR Studio','Generate customizable QR codes.',1,unixepoch()*1000),
('products','Products','Manage product catalogs.',1,unixepoch()*1000),
('forms','Forms','Collect leads and submissions.',1,unixepoch()*1000),
('invoices','Invoices','Create and manage invoices.',1,unixepoch()*1000),
('analytics','Analytics','View workspace performance and usage.',1,unixepoch()*1000);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO system_settings (setting_key,setting_value,updated_at) VALUES
('maintenance_mode','false',unixepoch()*1000),
('maintenance_message','OrbitDesk is undergoing scheduled maintenance. Please check back soon.',unixepoch()*1000),
('allow_registration','true',unixepoch()*1000),
('announcement_enabled','false',unixepoch()*1000),
('announcement_message','',unixepoch()*1000);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active,created_at DESC);
