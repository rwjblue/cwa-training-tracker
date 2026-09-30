-- Private proof that a now-unavailable exercise belonged to this account.
-- This is runtime authority, never a portable-backup permission grant.
CREATE TABLE retired_plan_tasks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, task_id, generation)
);
CREATE TRIGGER retired_plan_tasks_storage_limit BEFORE INSERT ON retired_plan_tasks
WHEN NOT EXISTS (SELECT 1 FROM retired_plan_tasks WHERE user_id = NEW.user_id AND task_id = NEW.task_id AND generation = NEW.generation)
  AND (SELECT storage_bytes FROM users WHERE id = NEW.user_id) + length(CAST(NEW.task_id AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER retired_plan_tasks_storage_insert AFTER INSERT ON retired_plan_tasks
BEGIN UPDATE users SET storage_bytes = storage_bytes + length(CAST(NEW.task_id AS BLOB)) WHERE id = NEW.user_id; END;
CREATE TRIGGER retired_plan_tasks_storage_delete AFTER DELETE ON retired_plan_tasks
BEGIN UPDATE users SET storage_bytes = storage_bytes - length(CAST(OLD.task_id AS BLOB)) WHERE id = OLD.user_id; END;
