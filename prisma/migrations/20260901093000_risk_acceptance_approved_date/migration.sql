-- Record when the second signature was given, and make new acceptances pending
-- by default rather than immediately in force.
ALTER TABLE "risk_acceptances" ADD COLUMN IF NOT EXISTS "approved_date" TIMESTAMP(3);
ALTER TABLE "risk_acceptances" ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL';
