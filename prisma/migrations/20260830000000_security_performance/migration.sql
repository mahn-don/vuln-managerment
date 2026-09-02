DO $$
DECLARE
  max_value BIGINT;
BEGIN
  IF to_regclass('public.assessment_internal_key_seq') IS NULL THEN
    CREATE SEQUENCE assessment_internal_key_seq;
    SELECT COALESCE(MAX(CAST(SUBSTRING(internal_key FROM '[0-9]+') AS BIGINT)), 0)
      INTO max_value
      FROM assessments;
    PERFORM setval('assessment_internal_key_seq', GREATEST(max_value, 1), max_value > 0);
  END IF;

  IF to_regclass('public.vulnerability_internal_key_seq') IS NULL THEN
    CREATE SEQUENCE vulnerability_internal_key_seq;
    SELECT COALESCE(MAX(CAST(SUBSTRING(internal_key FROM '[0-9]+') AS BIGINT)), 0)
      INTO max_value
      FROM vulnerabilities;
    PERFORM setval('vulnerability_internal_key_seq', GREATEST(max_value, 1), max_value > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS assessment_applications_application_id_assessment_id_idx
  ON assessment_applications (application_id, assessment_id);
CREATE INDEX IF NOT EXISTS vulnerability_applications_application_id_vulnerability_id_idx
  ON vulnerability_applications (application_id, vulnerability_id);

CREATE INDEX IF NOT EXISTS assessments_created_date_idx
  ON assessments (created_date);
CREATE INDEX IF NOT EXISTS vulnerabilities_created_date_idx
  ON vulnerabilities (created_date);
CREATE INDEX IF NOT EXISTS vulnerabilities_closed_date_idx
  ON vulnerabilities (closed_date);
CREATE INDEX IF NOT EXISTS vulnerabilities_source_assessment_id_idx
  ON vulnerabilities (source_assessment_id);
