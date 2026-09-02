-- AI triage of synced Jira tickets.
--
-- Ticket text is written by requesters, so the application name in a ticket
-- rarely matches the standardized name in the asset inventory. Every synced
-- issue is therefore queued for analysis (application resolution, scope,
-- security-review focus points). Existing rows default to PENDING so the
-- backlog is picked up by the triage worker on first run.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TriageStatus') THEN
    CREATE TYPE "TriageStatus" AS ENUM ('PENDING', 'DONE', 'FAILED', 'SKIPPED');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "external_issues"
  ADD COLUMN IF NOT EXISTS "triage_status" "TriageStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "triage" JSONB,
  ADD COLUMN IF NOT EXISTS "triaged_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "triage_model" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "triage_error" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "external_issues_triage_status_idx" ON "external_issues"("triage_status");
