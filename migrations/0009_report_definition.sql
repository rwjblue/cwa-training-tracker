-- Private report configuration shares the account revision/generation boundary.
-- Like meeting settings, it has its own small hard cap, outside practice quota.
ALTER TABLE users ADD COLUMN report_definition_json TEXT
  CHECK (report_definition_json IS NULL OR
    (json_valid(report_definition_json) AND json_type(report_definition_json) = 'object'
      AND length(CAST(report_definition_json AS BLOB)) <= 32000));
