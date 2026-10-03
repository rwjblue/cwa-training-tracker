-- Existing immutable account-owned report rows also hold reviewed handoffs.
CREATE UNIQUE INDEX advisor_report_submission_reservation ON advisor_reports
(user_id, json_extract(report_json,'$.handoff.submissionId'))
WHERE json_extract(report_json,'$.status')='handoff';
CREATE TRIGGER advisor_report_confirmation_parent BEFORE INSERT ON advisor_reports
WHEN json_type(NEW.report_json,'$.confirmation') IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM advisor_reports AS parent WHERE parent.user_id=NEW.user_id
 AND parent.id=json_extract(NEW.report_json,'$.confirmation.handoffId')
 AND json_extract(parent.report_json,'$.status')='handoff'
 AND json_extract(parent.report_json,'$.handoff.submissionId')=NEW.id)
BEGIN SELECT RAISE(ABORT,'report_handoff_missing'); END;
CREATE TRIGGER advisor_report_revision_parent BEFORE INSERT ON advisor_reports
WHEN json_type(NEW.report_json,'$.revisionOf') IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM advisor_reports AS parent WHERE parent.user_id=NEW.user_id
 AND parent.id=json_extract(NEW.report_json,'$.revisionOf')
 AND json_extract(parent.report_json,'$.status')='submitted')
BEGIN SELECT RAISE(ABORT,'report_revision_missing'); END;
