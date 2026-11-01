-- Attach every existing workspace-owned resource to the user's default workspace.
ALTER TABLE pages ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE bio_profiles ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE product_stores ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE forms ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE analytics_events ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;

UPDATE pages SET workspace_id = (SELECT w.id FROM workspaces w WHERE w.owner_user_id = pages.user_id ORDER BY w.created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE bio_profiles SET workspace_id = (SELECT w.id FROM workspaces w WHERE w.owner_user_id = bio_profiles.user_id ORDER BY w.created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE products SET workspace_id = (SELECT w.id FROM workspaces w WHERE w.owner_user_id = products.user_id ORDER BY w.created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE product_stores SET workspace_id = (SELECT w.id FROM workspaces w WHERE w.owner_user_id = product_stores.user_id ORDER BY w.created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE forms SET workspace_id = (SELECT w.id FROM workspaces w WHERE w.owner_user_id = forms.user_id ORDER BY w.created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE invoices SET workspace_id = (SELECT w.id FROM workspaces w WHERE w.owner_user_id = invoices.user_id ORDER BY w.created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE analytics_events SET workspace_id = (
  SELECT COALESCE(
    (SELECT p.workspace_id FROM pages p WHERE p.id = analytics_events.resource_id AND analytics_events.resource_type = 'page'),
    (SELECT b.workspace_id FROM bio_profiles b JOIN bio_links l ON l.profile_id = b.id WHERE l.id = analytics_events.resource_id AND analytics_events.resource_type = 'bio_link'),
    (SELECT w.id FROM workspaces w WHERE w.owner_user_id = analytics_events.user_id ORDER BY w.created_at LIMIT 1)
  )
) WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pages_workspace_created ON pages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bio_profiles_workspace ON bio_profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_products_workspace_created ON products(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_stores_workspace ON product_stores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_forms_workspace_created ON forms(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace_created ON invoices(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_workspace_date ON analytics_events(workspace_id, created_at DESC);
