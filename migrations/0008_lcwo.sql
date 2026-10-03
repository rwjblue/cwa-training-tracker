-- Private retained LCWO identity and immutable source facts. No credentials or cookies.
CREATE TABLE lcwo_links (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, link_json TEXT NOT NULL);
CREATE TABLE lcwo_results (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, run_json TEXT NOT NULL, PRIMARY KEY(user_id,id));
CREATE TRIGGER lcwo_results_limit BEFORE INSERT ON lcwo_results
WHEN NOT EXISTS (SELECT 1 FROM lcwo_results WHERE user_id=NEW.user_id AND id=NEW.id) AND (SELECT count(*) FROM lcwo_results WHERE user_id=NEW.user_id) >= 10000
BEGIN SELECT RAISE(ABORT, 'lcwo_result_limit'); END;
CREATE TRIGGER lcwo_links_storage_limit_insert BEFORE INSERT ON lcwo_links
WHEN NOT EXISTS (SELECT 1 FROM lcwo_links WHERE user_id=NEW.user_id) AND
 (SELECT storage_bytes-lifecycle_control_bytes FROM users WHERE id=NEW.user_id)+length(CAST(NEW.link_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER lcwo_links_storage_limit_update BEFORE UPDATE OF link_json ON lcwo_links
WHEN (SELECT storage_bytes-lifecycle_control_bytes FROM users WHERE id=NEW.user_id)-length(CAST(OLD.link_json AS BLOB))+length(CAST(NEW.link_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER lcwo_links_storage_insert AFTER INSERT ON lcwo_links
BEGIN UPDATE users SET storage_bytes=storage_bytes+length(CAST(NEW.link_json AS BLOB)), history_revision=history_revision+1 WHERE id=NEW.user_id; END;
CREATE TRIGGER lcwo_links_storage_update AFTER UPDATE OF link_json ON lcwo_links
BEGIN UPDATE users SET storage_bytes=storage_bytes-length(CAST(OLD.link_json AS BLOB))+length(CAST(NEW.link_json AS BLOB)), history_revision=history_revision+1 WHERE id=NEW.user_id; END;
CREATE TRIGGER lcwo_links_storage_delete AFTER DELETE ON lcwo_links
BEGIN UPDATE users SET storage_bytes=storage_bytes-length(CAST(OLD.link_json AS BLOB)), history_revision=history_revision+1 WHERE id=OLD.user_id; END;
CREATE TRIGGER lcwo_results_storage_limit_insert BEFORE INSERT ON lcwo_results
WHEN NOT EXISTS (SELECT 1 FROM lcwo_results WHERE user_id=NEW.user_id AND id=NEW.id) AND
 (SELECT storage_bytes-lifecycle_control_bytes FROM users WHERE id=NEW.user_id)+length(CAST(NEW.run_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER lcwo_results_storage_limit_update BEFORE UPDATE OF run_json ON lcwo_results
WHEN (SELECT storage_bytes-lifecycle_control_bytes FROM users WHERE id=NEW.user_id)-length(CAST(OLD.run_json AS BLOB))+length(CAST(NEW.run_json AS BLOB)) > 6291456
BEGIN SELECT RAISE(ABORT, 'account_storage_limit'); END;
CREATE TRIGGER lcwo_results_storage_insert AFTER INSERT ON lcwo_results
BEGIN UPDATE users SET storage_bytes=storage_bytes+length(CAST(NEW.run_json AS BLOB)), history_revision=history_revision+1 WHERE id=NEW.user_id; END;
CREATE TRIGGER lcwo_results_storage_update AFTER UPDATE OF run_json ON lcwo_results
BEGIN UPDATE users SET storage_bytes=storage_bytes-length(CAST(OLD.run_json AS BLOB))+length(CAST(NEW.run_json AS BLOB)), history_revision=history_revision+1 WHERE id=NEW.user_id; END;
CREATE TRIGGER lcwo_results_storage_delete AFTER DELETE ON lcwo_results
BEGIN UPDATE users SET storage_bytes=storage_bytes-length(CAST(OLD.run_json AS BLOB)), history_revision=history_revision+1 WHERE id=OLD.user_id; END;
