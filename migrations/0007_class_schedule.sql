-- Optional private native schedule; older date-only profiles acquire no times.
-- Keep it on the authenticated user row so existing account CAS transactions
-- and two-query coherent snapshots retain their authority and ordering.
ALTER TABLE users ADD COLUMN class_schedule_json TEXT
  CHECK (class_schedule_json IS NULL OR
    (json_valid(class_schedule_json) AND json_type(class_schedule_json) = 'object'
      AND length(CAST(class_schedule_json AS BLOB)) <= 16000));
