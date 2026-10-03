-- Immutable private saved report copies; working edits remain in scoped device state.
CREATE TABLE advisor_reports (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 report_json TEXT NOT NULL CHECK(json_valid(report_json) AND length(CAST(report_json AS BLOB))<=96000),
 PRIMARY KEY(user_id,id)
);
CREATE TRIGGER advisor_reports_limit BEFORE INSERT ON advisor_reports
WHEN NOT EXISTS (SELECT 1 FROM advisor_reports WHERE user_id=NEW.user_id AND id=NEW.id) AND (SELECT count(*) FROM advisor_reports WHERE user_id=NEW.user_id)>=200
BEGIN SELECT RAISE(ABORT,'report_copy_limit'); END;
CREATE TRIGGER advisor_reports_immutable BEFORE UPDATE OF report_json ON advisor_reports WHEN OLD.report_json<>NEW.report_json
BEGIN SELECT RAISE(ABORT,'report_copy_immutable'); END;
CREATE TRIGGER advisor_reports_storage_limit BEFORE INSERT ON advisor_reports
WHEN NOT EXISTS (SELECT 1 FROM advisor_reports WHERE user_id=NEW.user_id AND id=NEW.id) AND (SELECT storage_bytes-lifecycle_control_bytes FROM users WHERE id=NEW.user_id)+length(CAST(NEW.report_json AS BLOB))>6291456
BEGIN SELECT RAISE(ABORT,'account_storage_limit'); END;
CREATE TRIGGER advisor_reports_storage_insert AFTER INSERT ON advisor_reports
BEGIN UPDATE users SET storage_bytes=storage_bytes+length(CAST(NEW.report_json AS BLOB)),history_revision=history_revision+1 WHERE id=NEW.user_id; END;
CREATE TRIGGER advisor_reports_storage_delete AFTER DELETE ON advisor_reports
BEGIN UPDATE users SET storage_bytes=storage_bytes-length(CAST(OLD.report_json AS BLOB)),history_revision=history_revision+1 WHERE id=OLD.user_id; END;
-- Recheck source ownership inside the same transaction, including deletion races.
CREATE TRIGGER advisor_reports_evidence BEFORE INSERT ON advisor_reports
WHEN EXISTS(SELECT 1 FROM json_each(NEW.report_json,'$.evidence') AS ref
 WHERE (json_extract(ref.value,'$.kind')='practice' AND NOT EXISTS(SELECT 1 FROM practice_entries WHERE user_id=NEW.user_id AND id=json_extract(ref.value,'$.id')))
 OR (json_extract(ref.value,'$.kind')='lcwo' AND NOT EXISTS(SELECT 1 FROM lcwo_results WHERE user_id=NEW.user_id AND id=json_extract(ref.value,'$.id'))))
BEGIN SELECT RAISE(ABORT,'report_evidence_missing'); END;
