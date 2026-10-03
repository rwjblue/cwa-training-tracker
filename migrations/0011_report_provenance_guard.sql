-- Evidence reads must remain current through the atomic report insert.
ALTER TABLE account_revision_guards ADD COLUMN expected_history_revision INTEGER
  CHECK (expected_history_revision IS NULL OR expected_history_revision >= 0);
CREATE TRIGGER account_evidence_revision_guard BEFORE INSERT ON account_revision_guards
WHEN NEW.expected_history_revision IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM users WHERE id=NEW.user_id AND history_revision=NEW.expected_history_revision
)
BEGIN SELECT RAISE(ABORT, 'account_revision_conflict'); END;
