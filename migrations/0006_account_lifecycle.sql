-- A bounded cancellation reservation is separate from the ordinary 6 MiB quota.
-- Eight 512-byte slots reserve at most 4 KiB; actual control bytes are still
-- included in storage_bytes. Canceled receipts move into ordinary quota when
-- there is room, preserving tombstones while freeing control admission slots.
ALTER TABLE users ADD COLUMN lifecycle_control_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN lifecycle_control_slots INTEGER NOT NULL DEFAULT 0;
-- History authority is independent of the semantic settings/plan outbox.
-- Every actual entry mutation advances it, including ordinary unlinked writes.
ALTER TABLE users ADD COLUMN history_revision INTEGER NOT NULL DEFAULT 0 CHECK (history_revision >= 0);
CREATE TRIGGER practice_entries_history_insert AFTER INSERT ON practice_entries
BEGIN UPDATE users SET history_revision = history_revision + 1 WHERE id = NEW.user_id; END;
CREATE TRIGGER practice_entries_history_update AFTER UPDATE ON practice_entries
BEGIN UPDATE users SET history_revision = history_revision + 1 WHERE id IN (OLD.user_id, NEW.user_id); END;
CREATE TRIGGER practice_entries_history_delete AFTER DELETE ON practice_entries
BEGIN UPDATE users SET history_revision = history_revision + 1 WHERE id = OLD.user_id; END;

-- Terminal receipts outlive destructive history replacement. The unique identity
-- decides cancel/apply races within the same transaction as all dataset writes.
CREATE TABLE account_lifecycle_receipts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lifecycle_id TEXT NOT NULL CHECK (length(CAST(lifecycle_id AS BLOB)) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('reset', 'replace')),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  base_revision INTEGER NOT NULL,
  base_history_revision INTEGER NOT NULL CHECK (base_history_revision >= 0),
  generation INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pending', 'applied', 'canceled')),
  result_json TEXT NOT NULL CHECK (length(CAST(result_json AS BLOB)) <= 256 AND (outcome = 'applied' OR result_json = '{}')),
  created_at INTEGER NOT NULL,
  control_budget INTEGER NOT NULL DEFAULT 1 CHECK (control_budget IN (0, 1)
    AND (outcome != 'pending' OR control_budget = 1)
    AND (outcome != 'applied' OR control_budget = 0)),
  PRIMARY KEY (user_id, lifecycle_id)
);
-- Only prepared receipts may admit a destructive transaction. Cancellation
-- and application serialize on this same row, with the guard inside D1's batch.
CREATE TABLE account_lifecycle_guards (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lifecycle_id TEXT NOT NULL
);
CREATE TRIGGER account_lifecycle_guard BEFORE INSERT ON account_lifecycle_guards
WHEN NOT EXISTS (SELECT 1 FROM account_lifecycle_receipts
  WHERE user_id = NEW.user_id AND lifecycle_id = NEW.lifecycle_id AND outcome = 'pending')
BEGIN SELECT RAISE(ABORT, 'lifecycle_not_prepared'); END;
CREATE TRIGGER account_lifecycle_history_guard BEFORE INSERT ON account_lifecycle_guards
WHEN NOT EXISTS (SELECT 1 FROM account_lifecycle_receipts AS receipt JOIN users ON users.id = receipt.user_id
  WHERE receipt.user_id = NEW.user_id AND receipt.lifecycle_id = NEW.lifecycle_id
    AND receipt.base_history_revision = users.history_revision)
BEGIN SELECT RAISE(ABORT, 'account_history_conflict'); END;

-- Preflight reads cannot admit a stale backup if history commits before prepare.
CREATE TRIGGER account_lifecycle_prepare_history_guard BEFORE INSERT ON account_lifecycle_receipts
WHEN NEW.outcome = 'pending' AND NOT EXISTS (SELECT 1 FROM users
  WHERE id = NEW.user_id AND history_revision = NEW.base_history_revision)
BEGIN SELECT RAISE(ABORT, 'account_history_conflict'); END;

-- Include the compact string fields and fixed counter/timestamp overhead.
CREATE TRIGGER account_lifecycle_control_limit BEFORE INSERT ON account_lifecycle_receipts
WHEN NOT EXISTS (SELECT 1 FROM account_lifecycle_receipts WHERE user_id = NEW.user_id AND lifecycle_id = NEW.lifecycle_id)
  AND (NEW.outcome = 'applied' OR NEW.control_budget != 1 OR (SELECT lifecycle_control_slots FROM users WHERE id = NEW.user_id) >= 8)
BEGIN SELECT RAISE(ABORT, 'lifecycle_capacity'); END;
CREATE TRIGGER account_lifecycle_receipt_immutable BEFORE UPDATE ON account_lifecycle_receipts
WHEN OLD.outcome = 'applied'
  OR (OLD.outcome = 'pending' AND NEW.outcome NOT IN ('applied', 'canceled'))
  OR (OLD.outcome = 'canceled' AND (NEW.outcome != 'canceled' OR OLD.control_budget != 1
    OR NEW.control_budget != 0 OR NEW.result_json != OLD.result_json))
  OR NEW.user_id != OLD.user_id OR NEW.lifecycle_id != OLD.lifecycle_id
  OR NEW.kind != OLD.kind OR NEW.payload_hash != OLD.payload_hash
  OR NEW.base_revision != OLD.base_revision OR NEW.generation != OLD.generation
  OR NEW.base_history_revision != OLD.base_history_revision
  OR NEW.created_at != OLD.created_at
BEGIN SELECT RAISE(ABORT, 'lifecycle_receipt_immutable'); END;
CREATE TRIGGER account_lifecycle_storage_limit BEFORE UPDATE ON account_lifecycle_receipts
WHEN OLD.control_budget = 1 AND NEW.control_budget = 0 AND
  (SELECT storage_bytes - lifecycle_control_bytes FROM users WHERE id = NEW.user_id)
  + length(CAST(NEW.lifecycle_id AS BLOB)) + length(CAST(NEW.kind AS BLOB))
  + length(CAST(NEW.payload_hash AS BLOB)) + length(CAST(NEW.outcome AS BLOB))
  + length(CAST(NEW.result_json AS BLOB)) + 72 > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER account_lifecycle_storage_insert AFTER INSERT ON account_lifecycle_receipts
BEGIN UPDATE users SET
  storage_bytes = storage_bytes + length(CAST(NEW.lifecycle_id AS BLOB)) + length(CAST(NEW.kind AS BLOB))
    + length(CAST(NEW.payload_hash AS BLOB)) + length(CAST(NEW.outcome AS BLOB)) + length(CAST(NEW.result_json AS BLOB)) + 72,
  lifecycle_control_bytes = lifecycle_control_bytes + length(CAST(NEW.lifecycle_id AS BLOB)) + length(CAST(NEW.kind AS BLOB))
    + length(CAST(NEW.payload_hash AS BLOB)) + length(CAST(NEW.outcome AS BLOB)) + length(CAST(NEW.result_json AS BLOB)) + 72,
  lifecycle_control_slots = lifecycle_control_slots + 1 WHERE id = NEW.user_id; END;
CREATE TRIGGER account_lifecycle_storage_update AFTER UPDATE ON account_lifecycle_receipts
BEGIN UPDATE users SET
  storage_bytes = storage_bytes
    - length(CAST(OLD.lifecycle_id AS BLOB)) - length(CAST(OLD.kind AS BLOB))
    - length(CAST(OLD.payload_hash AS BLOB)) - length(CAST(OLD.outcome AS BLOB)) - length(CAST(OLD.result_json AS BLOB)) - 72
    + length(CAST(NEW.lifecycle_id AS BLOB)) + length(CAST(NEW.kind AS BLOB))
    + length(CAST(NEW.payload_hash AS BLOB)) + length(CAST(NEW.outcome AS BLOB)) + length(CAST(NEW.result_json AS BLOB)) + 72,
  lifecycle_control_bytes = lifecycle_control_bytes
    - CASE WHEN OLD.control_budget = 1 THEN length(CAST(OLD.lifecycle_id AS BLOB)) + length(CAST(OLD.kind AS BLOB))
      + length(CAST(OLD.payload_hash AS BLOB)) + length(CAST(OLD.outcome AS BLOB)) + length(CAST(OLD.result_json AS BLOB)) + 72 ELSE 0 END
    + CASE WHEN NEW.control_budget = 1 THEN length(CAST(NEW.lifecycle_id AS BLOB)) + length(CAST(NEW.kind AS BLOB))
      + length(CAST(NEW.payload_hash AS BLOB)) + length(CAST(NEW.outcome AS BLOB)) + length(CAST(NEW.result_json AS BLOB)) + 72 ELSE 0 END,
  lifecycle_control_slots = lifecycle_control_slots - OLD.control_budget + NEW.control_budget
  WHERE id = NEW.user_id; END;
CREATE TRIGGER account_lifecycle_storage_delete AFTER DELETE ON account_lifecycle_receipts
BEGIN UPDATE users SET storage_bytes = storage_bytes
  - length(CAST(OLD.lifecycle_id AS BLOB)) - length(CAST(OLD.kind AS BLOB))
  - length(CAST(OLD.payload_hash AS BLOB)) - length(CAST(OLD.outcome AS BLOB)) - length(CAST(OLD.result_json AS BLOB)) - 72,
  lifecycle_control_bytes = lifecycle_control_bytes - CASE WHEN OLD.control_budget = 1 THEN
    length(CAST(OLD.lifecycle_id AS BLOB)) + length(CAST(OLD.kind AS BLOB)) + length(CAST(OLD.payload_hash AS BLOB))
    + length(CAST(OLD.outcome AS BLOB)) + length(CAST(OLD.result_json AS BLOB)) + 72 ELSE 0 END,
  lifecycle_control_slots = lifecycle_control_slots - CASE WHEN OLD.control_budget = 1 THEN 1 ELSE 0 END
  WHERE id = OLD.user_id; END;

-- Private payloads and ordinary receipts retain the 6 MiB limit. Compact pending
-- and canceled controls consume their bounded independent reservation instead.
DROP TRIGGER practice_entries_storage_limit_insert;
CREATE TRIGGER practice_entries_storage_limit_insert BEFORE INSERT ON practice_entries
WHEN NOT EXISTS (SELECT 1 FROM practice_entries WHERE user_id = NEW.user_id AND id = NEW.id)
  AND (SELECT storage_bytes - lifecycle_control_bytes FROM users WHERE id = NEW.user_id) + length(CAST(NEW.entry_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
DROP TRIGGER practice_entries_storage_limit_update;
CREATE TRIGGER practice_entries_storage_limit_update BEFORE UPDATE OF entry_json ON practice_entries
WHEN (SELECT storage_bytes - lifecycle_control_bytes FROM users WHERE id = NEW.user_id) - length(CAST(OLD.entry_json AS BLOB)) + length(CAST(NEW.entry_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
DROP TRIGGER training_plan_storage_limit_insert;
CREATE TRIGGER training_plan_storage_limit_insert BEFORE INSERT ON training_plan
WHEN NOT EXISTS (SELECT 1 FROM training_plan WHERE user_id = NEW.user_id AND id = NEW.id)
  AND (SELECT storage_bytes - lifecycle_control_bytes FROM users WHERE id = NEW.user_id) + length(CAST(NEW.task_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
DROP TRIGGER training_plan_storage_limit_update;
CREATE TRIGGER training_plan_storage_limit_update BEFORE UPDATE OF task_json ON training_plan
WHEN (SELECT storage_bytes - lifecycle_control_bytes FROM users WHERE id = NEW.user_id) - length(CAST(OLD.task_json AS BLOB)) + length(CAST(NEW.task_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
DROP TRIGGER import_sources_storage_limit_insert;
CREATE TRIGGER import_sources_storage_limit_insert BEFORE INSERT ON import_sources
WHEN NOT EXISTS (SELECT 1 FROM import_sources WHERE user_id = NEW.user_id AND source_hash = NEW.source_hash AND chunk = NEW.chunk)
  AND (SELECT storage_bytes - lifecycle_control_bytes FROM users WHERE id = NEW.user_id) + length(CAST(NEW.source_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
DROP TRIGGER import_sources_storage_limit_update;
CREATE TRIGGER import_sources_storage_limit_update BEFORE UPDATE OF source_json ON import_sources
WHEN (SELECT storage_bytes - lifecycle_control_bytes FROM users WHERE id = NEW.user_id) - length(CAST(OLD.source_json AS BLOB)) + length(CAST(NEW.source_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
DROP TRIGGER account_receipt_storage_limit;
CREATE TRIGGER account_receipt_storage_limit BEFORE INSERT ON account_operation_receipts
WHEN (SELECT storage_bytes - lifecycle_control_bytes FROM users WHERE id = NEW.user_id)
  + length(CAST(NEW.operation_id AS BLOB)) + length(CAST(NEW.payload_hash AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
DROP TRIGGER retired_plan_tasks_storage_limit;
CREATE TRIGGER retired_plan_tasks_storage_limit BEFORE INSERT ON retired_plan_tasks
WHEN NOT EXISTS (SELECT 1 FROM retired_plan_tasks WHERE user_id = NEW.user_id AND task_id = NEW.task_id AND generation = NEW.generation)
  AND (SELECT storage_bytes - lifecycle_control_bytes FROM users WHERE id = NEW.user_id) + length(CAST(NEW.task_id AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
