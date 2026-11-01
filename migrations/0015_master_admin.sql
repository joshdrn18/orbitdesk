CREATE TABLE IF NOT EXISTS master_admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO master_admins (user_id, created_at)
SELECT id, unixepoch() * 1000
FROM users
WHERE lower(email) = lower('admorbit1@gmail.com')
  AND role = 'admin';
