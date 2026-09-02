// Re-export Prisma enums for use throughout the application
// This provides a single import point and decouples business logic from Prisma
export {
  Criticality,
  Severity,
  ApplicationStatus,
  AliasSource,
  OwnerType,
  SLAStatus,
  EntityType,
  MappingStatus,
  ImportStatus,
  ImportRowStatus,
  SyncStatus,
  ExternalSource,
  UserRole,
  ChangeSource,
  AuditSource,
  AIRecommendationStatus,
  RiskAcceptanceStatus,
  SyncType,
  SyncTrigger,
  SyncJobStatus,
} from "@/generated/prisma";

// Workflow vocabularies live in a Prisma-free module so client components
// can import them; re-exported here to keep this the single import point.
export {
  AssessmentStatus,
  VulnerabilityStatus,
  type AssessmentStatusType,
  type VulnerabilityStatusType,
} from "./workflow-status";

// Notification types
export const NotificationType = {
  SLA_APPROACHING: "sla_approaching",
  SLA_BREACH: "sla_breach",
  ASSESSMENT_OVERDUE: "assessment_overdue",
  MAPPING_REVIEW: "mapping_review",
  SYNC_FAILURE: "sync_failure",
  IMPORT_COMPLETE: "import_complete",
  IMPORT_FAILURE: "import_failure",
  ASSIGNMENT: "assignment",
  RISK_ACCEPTANCE_EXPIRING: "risk_acceptance_expiring",
  NEW_CRITICAL_VULN: "new_critical_vuln",
} as const;

export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType];
