-- Account-wide byte accounting keeps every backup below the 8 MiB import limit.
-- The 6 MiB budget includes practice entries, private plans, and all source archives.
ALTER TABLE users ADD COLUMN storage_bytes INTEGER NOT NULL DEFAULT 0;
UPDATE users SET storage_bytes =
  COALESCE((SELECT sum(length(CAST(entry_json AS BLOB))) FROM practice_entries WHERE user_id = users.id), 0) +
  COALESCE((SELECT sum(length(CAST(task_json AS BLOB))) FROM training_plan WHERE user_id = users.id), 0) +
  COALESCE((SELECT sum(length(CAST(source_json AS BLOB))) FROM import_sources WHERE user_id = users.id), 0);

CREATE TRIGGER practice_entries_storage_limit_insert BEFORE INSERT ON practice_entries
WHEN NOT EXISTS (SELECT 1 FROM practice_entries WHERE user_id = NEW.user_id AND id = NEW.id)
  AND (SELECT storage_bytes FROM users WHERE id = NEW.user_id) + length(CAST(NEW.entry_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER practice_entries_storage_limit_update BEFORE UPDATE OF entry_json ON practice_entries
WHEN (SELECT storage_bytes FROM users WHERE id = NEW.user_id) - length(CAST(OLD.entry_json AS BLOB)) + length(CAST(NEW.entry_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER practice_entries_storage_insert AFTER INSERT ON practice_entries
BEGIN UPDATE users SET storage_bytes = storage_bytes + length(CAST(NEW.entry_json AS BLOB)) WHERE id = NEW.user_id; END;
CREATE TRIGGER practice_entries_storage_update AFTER UPDATE OF entry_json ON practice_entries
BEGIN UPDATE users SET storage_bytes = storage_bytes - length(CAST(OLD.entry_json AS BLOB)) + length(CAST(NEW.entry_json AS BLOB)) WHERE id = NEW.user_id; END;
CREATE TRIGGER practice_entries_storage_delete AFTER DELETE ON practice_entries
BEGIN UPDATE users SET storage_bytes = storage_bytes - length(CAST(OLD.entry_json AS BLOB)) WHERE id = OLD.user_id; END;

CREATE TRIGGER training_plan_storage_limit_insert BEFORE INSERT ON training_plan
WHEN NOT EXISTS (SELECT 1 FROM training_plan WHERE user_id = NEW.user_id AND id = NEW.id)
  AND (SELECT storage_bytes FROM users WHERE id = NEW.user_id) + length(CAST(NEW.task_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER training_plan_storage_limit_update BEFORE UPDATE OF task_json ON training_plan
WHEN (SELECT storage_bytes FROM users WHERE id = NEW.user_id) - length(CAST(OLD.task_json AS BLOB)) + length(CAST(NEW.task_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER training_plan_storage_insert AFTER INSERT ON training_plan
BEGIN UPDATE users SET storage_bytes = storage_bytes + length(CAST(NEW.task_json AS BLOB)) WHERE id = NEW.user_id; END;
CREATE TRIGGER training_plan_storage_update AFTER UPDATE OF task_json ON training_plan
BEGIN UPDATE users SET storage_bytes = storage_bytes - length(CAST(OLD.task_json AS BLOB)) + length(CAST(NEW.task_json AS BLOB)) WHERE id = NEW.user_id; END;
CREATE TRIGGER training_plan_storage_delete AFTER DELETE ON training_plan
BEGIN UPDATE users SET storage_bytes = storage_bytes - length(CAST(OLD.task_json AS BLOB)) WHERE id = OLD.user_id; END;

CREATE TRIGGER import_sources_storage_limit_insert BEFORE INSERT ON import_sources
WHEN NOT EXISTS (SELECT 1 FROM import_sources WHERE user_id = NEW.user_id AND source_hash = NEW.source_hash AND chunk = NEW.chunk)
  AND (SELECT storage_bytes FROM users WHERE id = NEW.user_id) + length(CAST(NEW.source_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER import_sources_storage_limit_update BEFORE UPDATE OF source_json ON import_sources
WHEN (SELECT storage_bytes FROM users WHERE id = NEW.user_id) - length(CAST(OLD.source_json AS BLOB)) + length(CAST(NEW.source_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER import_sources_storage_insert AFTER INSERT ON import_sources
BEGIN UPDATE users SET storage_bytes = storage_bytes + length(CAST(NEW.source_json AS BLOB)) WHERE id = NEW.user_id; END;
CREATE TRIGGER import_sources_storage_update AFTER UPDATE OF source_json ON import_sources
BEGIN UPDATE users SET storage_bytes = storage_bytes - length(CAST(OLD.source_json AS BLOB)) + length(CAST(NEW.source_json AS BLOB)) WHERE id = NEW.user_id; END;
CREATE TRIGGER import_sources_storage_delete AFTER DELETE ON import_sources
BEGIN UPDATE users SET storage_bytes = storage_bytes - length(CAST(OLD.source_json AS BLOB)) WHERE id = OLD.user_id; END;


