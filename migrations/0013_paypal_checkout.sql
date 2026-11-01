CREATE TABLE IF NOT EXISTS paypal_payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  invoice_number TEXT NOT NULL UNIQUE,
  paypal_order_id TEXT UNIQUE,
  paypal_capture_id TEXT,
  amount_usd TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','pending','paid','failed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_paypal_orders_user_created
ON paypal_payment_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paypal_orders_status
ON paypal_payment_orders(status, created_at DESC);
