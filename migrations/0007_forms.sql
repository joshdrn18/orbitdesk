PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  fields_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_forms_user_created ON forms(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forms_slug_status ON forms(slug,status);

CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_date ON form_submissions(form_id,submitted_at DESC);
