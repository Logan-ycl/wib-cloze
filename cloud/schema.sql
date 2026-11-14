CREATE TABLE IF NOT EXISTS progress (
  account_hash TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  blob TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Plaintext mistake-only index, readable with a separate unguessable read-only token.
-- Full learning progress remains end-to-end encrypted in progress.blob.
CREATE TABLE IF NOT EXISTS mistake_readers (
  account_hash TEXT PRIMARY KEY,
  read_hash TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS mistake_events (
  account_hash TEXT NOT NULL,
  attempt_key TEXT NOT NULL,
  item_id TEXT NOT NULL,
  attempt_date TEXT NOT NULL,
  entered_word TEXT NOT NULL,
  hint_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_hash, attempt_key)
);
CREATE INDEX IF NOT EXISTS mistake_events_account_date ON mistake_events (account_hash, attempt_date);
