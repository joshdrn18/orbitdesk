CREATE TABLE IF NOT EXISTS master_admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO master_admins (user_id, created_at)
SELECT id, unixepoch() * 1000
FROM users
WHERE lower(email) = lower('admorbit1@gmail.com')
  AND role = 'admin';

INSERT INTO user_limit_overrides (user_id, limits_json, updated_by, updated_at)
SELECT id,
       '{"pages":-1,"qr_codes":-1,"products":-1,"forms":-1,"invoices_per_month":-1,"storage_mb":-1}',
       id,
       unixepoch() * 1000
FROM users
WHERE lower(email) = lower('admorbit1@gmail.com')
  AND role = 'admin'
ON CONFLICT(user_id) DO UPDATE SET
  limits_json = excluded.limits_json,
  updated_by = excluded.updated_by,
  updated_at = excluded.updated_at;
