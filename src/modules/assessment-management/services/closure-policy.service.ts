import { z } from "zod/v4";
import { prisma } from "@/lib/db/prisma";
import { auditService } from "@/modules/platform-services/services/audit.service";
import type { Prisma } from "@/generated/prisma";

/**
 * What a ticket must contain before it can be closed.
 *
 * A pentest that closes with no scope recorded, no owner and no finding count is
 * indistinguishable afterwards from one that was never done — the record is the
 * only evidence the work happened. Rather than hard-coding a list, the security
 * team declares the requirements here and the platform enforces them at the
 * closing transition.
 *
 * Requirements are scoped two ways because the answer genuinely differs: a
 * go-live pentest and an annual periodic pentest do not need the same evidence,
 * and a threat-modelling ticket needs neither.
 */

export const SETTING_KEY = "assessment.closureChecks";

/**
 * The checks that can be required.
 *
 * Deliberately a fixed catalogue rather than free-text field names: each entry
 * knows how to test itself, so a requirement can never reference a field that
 * does not exist or silently pass because of a typo.
 */
export const CLOSURE_CHECKS = [
  "description",
  "scope",
  "assignee",
  "dueDate",
  "startedDate",
  "applications",
  "findingCount",
  "findingsLinked",
  "findingsTriaged",
  "complexity",
  "priority",
  "externalIssue",
] as const;

export type ClosureCheck = (typeof CLOSURE_CHECKS)[number];

/** Blocking rules stop the close; advisory ones are shown but let it through. */
export const ENFORCEMENTS = ["BLOCK", "WARN"] as const;
export type Enforcement = (typeof ENFORCEMENTS)[number];

export const ruleSchema = z.object({
  check: z.enum(CLOSURE_CHECKS),
  enforcement: z.enum(ENFORCEMENTS).default("BLOCK"),
  /** Assessment type code (PENTEST, CODEREVIEW…), or ALL for every type. */
  appliesToType: z.string().max(50).default("ALL"),
  /** GOLIVE, PERIODIC, or ALL. */
  appliesToScope: z.enum(["ALL", "GOLIVE", "PERIODIC"]).default("ALL"),
  enabled: z.boolean().default(true),
});

export const closurePolicySchema = z.object({
  rules: z.array(ruleSchema).max(60).default([]),
});

export type ClosureRule = z.infer<typeof ruleSchema>;
export type ClosurePolicy = z.infer<typeof closurePolicySchema>;

/**
 * Shipped defaults: what a penetration test must carry to be closed.
 *
 * Chosen so the platform is useful before anyone configures it, and so the
 * defaults are the ones a reviewer would ask for — who did it, what was in
 * scope, when it ran, and what it found.
 */
const DEFAULT_POLICY: ClosurePolicy = {
  rules: [
    { check: "scope", enforcement: "BLOCK", appliesToType: "PENTEST", appliesToScope: "ALL", enabled: true },
    { check: "assignee", enforcement: "BLOCK", appliesToType: "PENTEST", appliesToScope: "ALL", enabled: true },
    { check: "applications", enforcement: "BLOCK", appliesToType: "PENTEST", appliesToScope: "ALL", enabled: true },
    { check: "startedDate", enforcement: "BLOCK", appliesToType: "PENTEST", appliesToScope: "ALL", enabled: true },
    { check: "findingsTriaged", enforcement: "BLOCK", appliesToType: "PENTEST", appliesToScope: "ALL", enabled: true },
    { check: "description", enforcement: "WARN", appliesToType: "PENTEST", appliesToScope: "ALL", enabled: true },
    { check: "findingCount", enforcement: "WARN", appliesToType: "PENTEST", appliesToScope: "ALL", enabled: true },
  ],
};

const CACHE_MS = 30_000;
let cache: { value: ClosurePolicy; at: number } | null = null;

export async function getClosurePolicy(): Promise<ClosurePolicy> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  const parsed = row ? closurePolicySchema.safeParse(row.value) : null;
  const value = parsed?.success ? parsed.data : DEFAULT_POLICY;

  cache = { value, at: Date.now() };
  return value;
}

export function invalidateClosurePolicy() {
  cache = null;
}

export async function saveClosurePolicy(policy: ClosurePolicy, userId: string): Promise<ClosurePolicy> {
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: policy as unknown as Prisma.InputJsonValue, updatedById: userId },
    create: {
      key: SETTING_KEY,
      value: policy as unknown as Prisma.InputJsonValue,
      description: "Information a ticket must contain before it can be closed",
      updatedById: userId,
    },
  });

  invalidateClosurePolicy();

  await auditService.log({
    userId,
    action: "settings.closure_checks_update",
    entityType: "setting",
    details: {
      key: SETTING_KEY,
      ruleCount: policy.rules.length,
      blocking: policy.rules.filter((rule) => rule.enabled && rule.enforcement === "BLOCK").length,
    },
  });

  return policy;
}

/** Everything the checks need, loaded once. */
export interface AssessmentForClosure {
  id: string;
  description: string | null;
  scope: string | null;
  assigneeId: string | null;
  dueDate: Date | null;
  startedDate: Date | null;
  complexity: string | null;
  priority: string | null;
  externalIssueId: string | null;
  findingCount: number;
  assessmentType: { code: string } | null;
  applicationCount: number;
  linkedFindings: number;
  untriagedFindings: number;
}

/** How each check decides whether the ticket satisfies it. */
const PREDICATES: Record<ClosureCheck, (a: AssessmentForClosure) => boolean> = {
  description: (a) => Boolean(a.description && a.description.trim().length > 0),
  scope: (a) => Boolean(a.scope),
  assignee: (a) => Boolean(a.assigneeId),
  dueDate: (a) => Boolean(a.dueDate),
  startedDate: (a) => Boolean(a.startedDate),
  applications: (a) => a.applicationCount > 0,
  // A recorded count of zero is a valid answer — "we looked and found nothing"
  // is evidence. What fails is a count that was never touched while findings
  // exist, which means nobody reconciled the ticket with its own findings.
  findingCount: (a) => a.findingCount > 0 || a.linkedFindings === 0,
  findingsLinked: (a) => a.linkedFindings > 0,
  findingsTriaged: (a) => a.untriagedFindings === 0,
  complexity: (a) => Boolean(a.complexity),
  priority: (a) => Boolean(a.priority),
  externalIssue: (a) => Boolean(a.externalIssueId),
};

export interface ClosureEvaluation {
  ready: boolean;
  blocking: ClosureCheck[];
  warnings: ClosureCheck[];
  satisfied: ClosureCheck[];
}

/** Which rules apply to this ticket, given its type and scope. */
function applicableRules(policy: ClosurePolicy, assessment: AssessmentForClosure): ClosureRule[] {
  const typeCode = assessment.assessmentType?.code ?? "";
  return policy.rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.appliesToType !== "ALL" && rule.appliesToType !== typeCode) return false;
    if (rule.appliesToScope !== "ALL" && rule.appliesToScope !== assessment.scope) return false;
    return true;
  });
}

export function evaluateClosure(
  policy: ClosurePolicy,
  assessment: AssessmentForClosure
): ClosureEvaluation {
  const blocking: ClosureCheck[] = [];
  const warnings: ClosureCheck[] = [];
  const satisfied: ClosureCheck[] = [];

  for (const rule of applicableRules(policy, assessment)) {
    const passes = PREDICATES[rule.check](assessment);
    if (passes) satisfied.push(rule.check);
    else if (rule.enforcement === "BLOCK") blocking.push(rule.check);
    else warnings.push(rule.check);
  }

  return { ready: blocking.length === 0, blocking, warnings, satisfied };
}

/** Statuses that count as closing a ticket, so the checks run at the right moment. */
const TRIAGED_ONWARDS = ["NEW"];

/** Load an assessment in the shape the checks expect. */
export async function loadForClosure(assessmentId: string): Promise<AssessmentForClosure | null> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      description: true,
      scope: true,
      assigneeId: true,
      dueDate: true,
      startedDate: true,
      complexity: true,
      priority: true,
      externalIssueId: true,
      findingCount: true,
      assessmentType: { select: { code: true } },
      _count: { select: { assessmentApplications: true, vulnerabilities: true } },
    },
  });
  if (!assessment) return null;

  // "Untriaged" means a finding nobody has looked at yet; closing the ticket
  // over the top of one loses it.
  const untriaged = await prisma.vulnerability.count({
    where: { sourceAssessmentId: assessmentId, status: { in: TRIAGED_ONWARDS } },
  });

  return {
    id: assessment.id,
    description: assessment.description,
    scope: assessment.scope,
    assigneeId: assessment.assigneeId,
    dueDate: assessment.dueDate,
    startedDate: assessment.startedDate,
    complexity: assessment.complexity,
    priority: assessment.priority,
    externalIssueId: assessment.externalIssueId,
    findingCount: assessment.findingCount,
    assessmentType: assessment.assessmentType,
    applicationCount: assessment._count.assessmentApplications,
    linkedFindings: assessment._count.vulnerabilities,
    untriagedFindings: untriaged,
  };
}

/** Evaluate one assessment against the current policy. */
export async function evaluateAssessmentClosure(assessmentId: string): Promise<ClosureEvaluation | null> {
  const [policy, assessment] = await Promise.all([getClosurePolicy(), loadForClosure(assessmentId)]);
  if (!assessment) return null;
  return evaluateClosure(policy, assessment);
}
