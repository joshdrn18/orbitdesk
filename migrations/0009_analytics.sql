CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_click','bio_view','bio_click')),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Unknown',
  referrer TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_user_date
ON analytics_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_resource_date
ON analytics_events(resource_type,resource_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_type_date
ON analytics_events(user_id,event_type,created_at DESC);
