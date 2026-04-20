CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT DEFAULT '',
  category TEXT DEFAULT 'Autre',
  image TEXT DEFAULT '',
  ingredients_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  snapshot_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipes_updated_at ON recipes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);
CREATE INDEX IF NOT EXISTS idx_recipes_favorite ON recipes(favorite);
