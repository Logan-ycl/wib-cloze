CREATE TABLE IF NOT EXISTS progress (
  account_hash TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  blob TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
