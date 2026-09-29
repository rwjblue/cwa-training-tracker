CREATE TABLE training_plan (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  task_json TEXT NOT NULL CHECK (json_valid(task_json)),
  PRIMARY KEY (user_id, id)
);

CREATE TRIGGER training_plan_count_limit BEFORE INSERT ON training_plan
WHEN NOT EXISTS (SELECT 1 FROM training_plan WHERE user_id = NEW.user_id AND id = NEW.id)
AND (SELECT count(*) FROM training_plan WHERE user_id = NEW.user_id) >= 2000
BEGIN
  SELECT RAISE(ABORT, 'An account may contain up to 2000 planned exercises.');
END;
