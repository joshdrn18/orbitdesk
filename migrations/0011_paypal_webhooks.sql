CREATE TABLE IF NOT EXISTS paypal_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  resource_id TEXT NOT NULL DEFAULT '',
  resource_status TEXT NOT NULL DEFAULT '',
  event_create_time TEXT NOT NULL DEFAULT '',
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_type_received
ON paypal_webhook_events(event_type, received_at DESC);
