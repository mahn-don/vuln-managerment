-- Segregation of duties for risk acceptance.
--
-- A risk acceptance was created already ACTIVE with acceptedBy and approvedBy
-- set to the same person, so the approvedBy column implied a second signature
-- that never happened. Acceptances now start PENDING_APPROVAL and only take
-- effect when a different authorised person approves them.

ALTER TYPE "RiskAcceptanceStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL' BEFORE 'ACTIVE';
ALTER TYPE "RiskAcceptanceStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
