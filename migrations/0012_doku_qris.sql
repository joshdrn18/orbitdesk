PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN plan_expires_at INTEGER;

CREATE TABLE IF NOT EXISTS doku_payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  invoice_number TEXT NOT NULL UNIQUE,
  amount_idr INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','pending','paid','failed','expired')),
  checkout_url TEXT NOT NULL DEFAULT '',
  doku_request_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_doku_orders_user_created
ON doku_payment_orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doku_orders_status
ON doku_payment_orders(status,created_at DESC);

CREATE TABLE IF NOT EXISTS doku_webhook_events (
  request_id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  transaction_status TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doku_webhook_invoice
ON doku_webhook_events(invoice_number,received_at DESC);
