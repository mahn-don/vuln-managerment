"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

/**
 * Was: eleven pastel hues competing with severity for the eye.
 * Now: typographic and neutral — a dot carries the state, colour is reserved
 * for risk and time. Workflow stage is a fact, not an alarm.
 */

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  TRIAGED: "Triaged",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  PENDING_FIX: "Pending fix",
  READY_FOR_VERIFICATION: "Ready to verify",
  VERIFIED: "Verified",
  CLOSED: "Closed",
  RISK_ACCEPTED: "Risk accepted",
  FALSE_POSITIVE: "False positive",
  REOPENED: "Reopened",
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
};

/** Translation keys where the locale files already carry the status. */
const STATUS_KEYS: Record<string, string> = {
  NEW: "status.new",
  TRIAGED: "status.triaged",
  ASSIGNED: "status.assigned",
  IN_PROGRESS: "status.inProgress",
  VERIFIED: "status.resolved",
  CLOSED: "status.closed",
  RISK_ACCEPTED: "status.riskAccepted",
  FALSE_POSITIVE: "status.falsePositive",
  DRAFT: "status.draft",
  IN_REVIEW: "status.inReview",
  APPROVED: "status.approved",
  ACTIVE: "status.active",
  INACTIVE: "status.inactive",
  DECOMMISSIONED: "status.decommissioned",
  PLANNING: "status.planning",
  ARCHIVED: "status.archived",
  IN_REMEDIATION: "status.inRemediation",
  RESOLVED: "status.resolved",
  DUPLICATE: "status.duplicate",
  WONT_FIX: "status.wontFix",
  SCHEDULED: "status.scheduled",
  IN_EXECUTION: "status.inExecution",
  DONE: "status.done",
  CANCELLED: "status.cancelled",
  PENDING: "status.pending",
  REJECTED: "status.rejected",
  EXECUTING: "status.executing",
  COMPLETED: "status.completed",
  FAILED: "status.failed",
};

/** Only states that mean "needs a human" get any colour at all. */
const STATUS_DOT: Record<string, string> = {
  NEW: "bg-risk-critical",
  REOPENED: "bg-risk-critical",
  TRIAGED: "bg-risk-high",
  PENDING_FIX: "bg-risk-medium",
  READY_FOR_VERIFICATION: "bg-brand",
  ASSIGNED: "bg-risk-low",
  IN_PROGRESS: "bg-risk-low",
  IN_REVIEW: "bg-risk-low",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const { t } = useTranslation();
  const key = STATUS_KEYS[value];
  // t() echoes the key back on a miss, so treat that as "not translated".
  const translated = key ? t(key) : undefined;
  const label =
    (translated && translated !== key ? translated : undefined) ??
    STATUS_LABELS[value] ??
    value.replace(/_/g, " ").toLowerCase();
  const dot = STATUS_DOT[value] ?? "bg-muted-foreground/45";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] text-muted-foreground", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      {label}
    </span>
  );
}
