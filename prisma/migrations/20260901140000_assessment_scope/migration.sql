-- Go-live vs periodic assessment scope.
--
-- The bank runs the same testing at two scopes: a go-live assessment covers only
-- what changed (a feature, a hotfix), a periodic assessment covers the whole
-- application on a risk-based cadence. Both exist for the same application at the
-- same time, so scope has to be its own axis rather than an assessment type --
-- a penetration test can be either. Findings inherit the scope they were found
-- under so go-live and periodic risk can be reported separately.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssessmentScope') THEN
    CREATE TYPE "AssessmentScope" AS ENUM ('GOLIVE', 'PERIODIC');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "scope" "AssessmentScope";
ALTER TABLE "vulnerabilities" ADD COLUMN IF NOT EXISTS "scope" "AssessmentScope";
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "assessment_interval_months" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "assessments_scope_idx" ON "assessments"("scope");
CREATE INDEX IF NOT EXISTS "vulnerabilities_scope_idx" ON "vulnerabilities"("scope");

-- Backfill: the existing GOLIVE and PERIODIC assessment types already encoded
-- scope in the type, so carry that across before the two concepts separate.
UPDATE "assessments" a
SET "scope" = 'GOLIVE'
FROM "assessment_types" t
WHERE a."assessment_type_id" = t."id" AND t."code" = 'GOLIVE' AND a."scope" IS NULL;

UPDATE "assessments" a
SET "scope" = 'PERIODIC'
FROM "assessment_types" t
WHERE a."assessment_type_id" = t."id" AND t."code" = 'PERIODIC' AND a."scope" IS NULL;

-- Findings inherit the scope of the assessment that produced them.
UPDATE "vulnerabilities" v
SET "scope" = a."scope"
FROM "assessments" a
WHERE v."source_assessment_id" = a."id" AND a."scope" IS NOT NULL AND v."scope" IS NULL;
