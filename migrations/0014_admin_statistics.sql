-- Ordinary access remains implicit. Additional grants are operator-managed,
-- keyed to permanent accounts, and excluded from user imports and backups.
CREATE TABLE account_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role = 'metrics_viewer'),
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, role)
);

-- Keep one coarse overwritten day, not a per-account activity history.
ALTER TABLE users ADD COLUMN last_activity_day TEXT
  CHECK(last_activity_day IS NULL OR last_activity_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');

-- This is the complete practice measurement schema. No identity or private
-- practice payload is retained, including for authenticated practice.
CREATE TABLE practice_usage (
  day TEXT NOT NULL CHECK(day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  tool TEXT NOT NULL CHECK(tool IN ('words', 'qso', 'stories', 'copy', 'sending', 'free', 'runner', 'recording', 'manual')),
  audience TEXT NOT NULL CHECK(audience IN ('guest', 'account')),
  count INTEGER NOT NULL CHECK(typeof(count) = 'integer' AND count >= 0),
  PRIMARY KEY (day, tool, audience)
);

CREATE TABLE admin_stats_metadata (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  practice_collection_started_day TEXT NOT NULL,
  last_cleanup_at TEXT
);
INSERT INTO admin_stats_metadata (id, practice_collection_started_day)
VALUES (1, strftime('%Y-%m-%d', 'now'));
