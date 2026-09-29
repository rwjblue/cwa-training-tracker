PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  profile_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE email_codes (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX email_codes_expiry ON email_codes(expires_at);

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports_json TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX passkeys_user ON passkeys(user_id);

CREATE TABLE ceremonies (
  token_hash TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('login', 'register')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX ceremonies_expiry ON ceremonies(expires_at);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);

CREATE TABLE practice_entries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  entry_json TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX practice_entries_dates ON practice_entries(user_id, date DESC);
CREATE TRIGGER practice_entries_limit BEFORE INSERT ON practice_entries
WHEN NOT EXISTS (SELECT 1 FROM practice_entries WHERE user_id = NEW.user_id AND id = NEW.id)
  AND (SELECT count(*) FROM practice_entries WHERE user_id = NEW.user_id) >= 20000
BEGIN
  SELECT RAISE(ABORT, 'practice_entry_limit');
END;

-- Keep source data separately so future import improvements are reversible.
CREATE TABLE import_sources (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,
  chunk INTEGER NOT NULL,
  source_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, source_hash, chunk)
);
