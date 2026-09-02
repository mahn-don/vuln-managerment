/**
 * Workflow vocabularies, free of any Prisma import.
 *
 * These live apart from types/enums.ts because that module re-exports the
 * generated Prisma enums: importing anything from it inside a client component
 * drags the Prisma client into the browser bundle, which fails the build on
 * `node:module`. Status lists are needed by pickers and badges on the client,
 * so they have to stay pure.
 */

// Assessment statuses (not an enum in DB for flexibility)
export const AssessmentStatus = {
  REQUESTED: "REQUESTED",
  TRIAGE: "TRIAGE",
  QUEUED: "QUEUED",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  WAITING_INFO: "WAITING_INFO",
  REVIEW_COMPLETE: "REVIEW_COMPLETE",
  FINDINGS_DOCUMENTED: "FINDINGS_DOCUMENTED",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
} as const;

export type AssessmentStatusType = (typeof AssessmentStatus)[keyof typeof AssessmentStatus];

// Vulnerability statuses (not an enum in DB for flexibility)
export const VulnerabilityStatus = {
  NEW: "NEW",
  TRIAGED: "TRIAGED",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  PENDING_FIX: "PENDING_FIX",
  READY_FOR_VERIFICATION: "READY_FOR_VERIFICATION",
  VERIFIED: "VERIFIED",
  CLOSED: "CLOSED",
  FALSE_POSITIVE: "FALSE_POSITIVE",
  RISK_ACCEPTED: "RISK_ACCEPTED",
  DUPLICATE: "DUPLICATE",
  WONT_FIX: "WONT_FIX",
} as const;

export type VulnerabilityStatusType = (typeof VulnerabilityStatus)[keyof typeof VulnerabilityStatus];
