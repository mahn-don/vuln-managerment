-- Application criticality becomes a three-point level.
--
-- The four-value criticality scale is replaced by a numeric level, 1-3, where 1
-- is the most important. Level is deliberately not colour-coded in the UI: it
-- describes what a system is worth to the business, not how urgent anything is,
-- and colour on this platform is reserved for risk and time.
--
-- Backfill collapses four values into three, preserving every existing
-- behaviour: CRITICAL and HIGH were both assessed annually and become level 1;
-- MEDIUM and LOW were both biennial and become levels 2 and 3.

-- AlterTable: applications
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "level" INTEGER NOT NULL DEFAULT 2;

UPDATE "applications" SET "level" = CASE "criticality"
  WHEN 'CRITICAL' THEN 1
  WHEN 'HIGH'     THEN 1
  WHEN 'MEDIUM'   THEN 2
  WHEN 'LOW'      THEN 3
  ELSE 2
END;

-- AlterTable: SLA rules match on level rather than criticality
ALTER TABLE "sla_rules" ADD COLUMN IF NOT EXISTS "app_level" INTEGER;

UPDATE "sla_rules" SET "app_level" = CASE "app_criticality"
  WHEN 'CRITICAL' THEN 1
  WHEN 'HIGH'     THEN 1
  WHEN 'MEDIUM'   THEN 2
  WHEN 'LOW'      THEN 3
  ELSE NULL
END;

-- CreateIndex
DROP INDEX IF EXISTS "applications_criticality_idx";
CREATE INDEX IF NOT EXISTS "applications_level_idx" ON "applications"("level");

-- DropColumn: the old scale is fully represented by level above
ALTER TABLE "applications" DROP COLUMN IF EXISTS "criticality";
ALTER TABLE "sla_rules" DROP COLUMN IF EXISTS "app_criticality";
