-- Runtime authority is deliberately separate from portable version 1 backups.
ALTER TABLE users ADD COLUMN account_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN dataset_generation INTEGER NOT NULL DEFAULT 0;

-- Inserting this guard inside a D1 batch makes stale writes abort the entire
-- transaction. A preflight SELECT alone cannot enforce compare-and-swap.
CREATE TABLE account_revision_guards (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  expected_revision INTEGER NOT NULL,
  expected_generation INTEGER NOT NULL
);
CREATE TRIGGER account_revision_guard BEFORE INSERT ON account_revision_guards
WHEN NOT EXISTS (
  SELECT 1 FROM users WHERE id = NEW.user_id
    AND account_revision = NEW.expected_revision
    AND dataset_generation = NEW.expected_generation
)
BEGIN SELECT RAISE(ABORT, 'account_revision_conflict'); END;

CREATE TABLE account_operation_receipts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  generation INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, operation_id)
);
-- Receipts retain compact hashes, never a second copy of private task content.
-- Count their bytes so idempotency metadata cannot bypass the account budget.
CREATE TRIGGER account_receipt_storage_limit BEFORE INSERT ON account_operation_receipts
WHEN (SELECT storage_bytes FROM users WHERE id = NEW.user_id)
  + length(CAST(NEW.operation_id AS BLOB)) + length(CAST(NEW.payload_hash AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER account_receipt_storage_insert AFTER INSERT ON account_operation_receipts
BEGIN UPDATE users SET storage_bytes = storage_bytes + length(CAST(NEW.operation_id AS BLOB)) + length(CAST(NEW.payload_hash AS BLOB)) WHERE id = NEW.user_id; END;
CREATE TRIGGER account_receipt_storage_delete AFTER DELETE ON account_operation_receipts
BEGIN UPDATE users SET storage_bytes = storage_bytes - length(CAST(OLD.operation_id AS BLOB)) - length(CAST(OLD.payload_hash AS BLOB)) WHERE id = OLD.user_id; END;
