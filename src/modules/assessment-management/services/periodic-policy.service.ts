import { prisma } from "@/lib/db/prisma";

/**
 * How often each application must be assessed end to end.
 *
 * Higher-risk applications are reassessed annually, the rest every two years.
 * The mapping is policy, not code: it lives in system settings so the security
 * team can change the cadence without a deployment, exactly like the SLA rules.
 * An application may still override its own interval when there is a reason to.
 */

export const POLICY_KEY = "assessment.periodic";

/** Application levels, 1 (most important) to 3. */
export const APPLICATION_LEVELS = [1, 2, 3] as const;
export type ApplicationLevel = (typeof APPLICATION_LEVELS)[number];

/** Months between periodic assessments, by application level. */
export type PeriodicPolicy = Record<ApplicationLevel, number>;

const DEFAULT_POLICY: PeriodicPolicy = {
  1: 12,
  2: 24,
  3: 24,
};

/** How close to the due date an application counts as "coming up". */
export const DUE_SOON_DAYS = 60;

const CACHE_MS = 60_000;
let cache: { value: PeriodicPolicy; at: number } | null = null;

export async function getPeriodicPolicy(now = Date.now()): Promise<PeriodicPolicy> {
  if (cache && now - cache.at < CACHE_MS) return cache.value;

  const row = await prisma.systemSetting.findUnique({ where: { key: POLICY_KEY } });
  const stored = (row?.value ?? {}) as Partial<Record<string, unknown>>;

  const policy: PeriodicPolicy = { ...DEFAULT_POLICY };
  for (const level of APPLICATION_LEVELS) {
    const months = stored[String(level)];
    if (typeof months === "number" && months > 0) policy[level] = months;
  }

  cache = { value: policy, at: now };
  return policy;
}

export function invalidatePeriodicPolicy() {
  cache = null;
}

/** The interval that applies to one application: its override, else the policy. */
export function intervalForApplication(
  application: { level: number; assessmentIntervalMonths?: number | null },
  policy: PeriodicPolicy
): number {
  const level = normaliseLevel(application.level);
  return application.assessmentIntervalMonths ?? policy[level] ?? DEFAULT_POLICY[2];
}

/** Guards against a level outside 1-3 arriving from an import or a bad write. */
export function normaliseLevel(value: number | null | undefined): ApplicationLevel {
  if (value === 1 || value === 2 || value === 3) return value;
  return 2;
}

/** "Annual" and "biennial" are what people say; months are what we store. */
export function cadenceLabel(months: number): "ANNUAL" | "BIENNIAL" | "CUSTOM" {
  if (months === 12) return "ANNUAL";
  if (months === 24) return "BIENNIAL";
  return "CUSTOM";
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const targetMonth = result.getMonth() + months;
  result.setMonth(targetMonth);
  // Clamp a rolled-over day (31 Jan + 1 month) back to the end of the intended month.
  if (result.getMonth() !== ((targetMonth % 12) + 12) % 12) result.setDate(0);
  return result;
}

/**
 * Where an application stands against its periodic obligation.
 *
 * NEVER_ASSESSED is deliberately distinct from OVERDUE: an application that has
 * never had a full assessment is a different conversation from one whose cycle
 * has lapsed, and reporting them as one number hides the gap.
 */
export type PeriodicState = "NEVER_ASSESSED" | "OVERDUE" | "DUE_SOON" | "CURRENT";

export function periodicState(
  lastAssessmentDate: Date | null | undefined,
  nextAssessmentDue: Date | null | undefined,
  now: Date
): PeriodicState {
  if (!lastAssessmentDate) return "NEVER_ASSESSED";
  if (!nextAssessmentDue) return "CURRENT";

  const daysRemaining = Math.floor((nextAssessmentDue.getTime() - now.getTime()) / 86_400_000);
  if (daysRemaining < 0) return "OVERDUE";
  if (daysRemaining <= DUE_SOON_DAYS) return "DUE_SOON";
  return "CURRENT";
}

/**
 * Which calendar year an application was last fully assessed in, relative to now.
 *
 * Deliberately calendar-based rather than elapsed-days: the question people ask
 * of an annual programme is "did we do it this year?", and an assessment from
 * last December is last year's work even though it was only weeks ago. This is a
 * different question from `periodicState`, which answers whether the application
 * is compliant with its own cadence — a biennial application assessed last year
 * is CURRENT but was not evaluated THIS_YEAR.
 */
export type EvaluationRecency =
  | "THIS_YEAR"
  | "LAST_YEAR"
  | "TWO_YEARS_AGO"
  | "OLDER"
  | "NEVER";

export function evaluationRecency(
  lastAssessmentDate: Date | null | undefined,
  now: Date
): EvaluationRecency {
  if (!lastAssessmentDate) return "NEVER";

  const yearsAgo = now.getFullYear() - lastAssessmentDate.getFullYear();
  if (yearsAgo <= 0) return "THIS_YEAR";
  if (yearsAgo === 1) return "LAST_YEAR";
  if (yearsAgo === 2) return "TWO_YEARS_AGO";
  return "OLDER";
}

/** The calendar-year boundaries behind a recency bucket, for querying. */
export function recencyRange(bucket: EvaluationRecency, now: Date): { gte?: Date; lt?: Date } | null {
  const year = now.getFullYear();
  const startOf = (y: number) => new Date(y, 0, 1);

  switch (bucket) {
    case "THIS_YEAR":
      return { gte: startOf(year) };
    case "LAST_YEAR":
      return { gte: startOf(year - 1), lt: startOf(year) };
    case "TWO_YEARS_AGO":
      return { gte: startOf(year - 2), lt: startOf(year - 1) };
    case "OLDER":
      return { lt: startOf(year - 2) };
    case "NEVER":
      return null;
  }
}

/**
 * Recompute the periodic cycle for the applications a completed assessment
 * covered. Only PERIODIC assessments move the clock — a go-live test examines
 * one change and says nothing about the rest of the application, so treating it
 * as a full assessment would silently mark an application compliant when whole
 * areas of it have not been looked at in years.
 */
export async function refreshPeriodicCycle(assessmentId: string, completedAt: Date): Promise<number> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      scope: true,
      assessmentApplications: { select: { applicationId: true } },
    },
  });

  if (!assessment || assessment.scope !== "PERIODIC") return 0;

  const policy = await getPeriodicPolicy();
  const applicationIds = assessment.assessmentApplications.map((link) => link.applicationId);
  if (applicationIds.length === 0) return 0;

  const applications = await prisma.application.findMany({
    where: { id: { in: applicationIds } },
    select: { id: true, level: true, assessmentIntervalMonths: true, lastAssessmentDate: true },
  });

  let updated = 0;
  for (const application of applications) {
    // A later assessment already moved the clock further out; don't wind it back.
    if (application.lastAssessmentDate && application.lastAssessmentDate > completedAt) continue;

    const months = intervalForApplication(application, policy);
    await prisma.application.update({
      where: { id: application.id },
      data: {
        lastAssessmentDate: completedAt,
        nextAssessmentDue: addMonths(completedAt, months),
      },
    });
    updated++;
  }

  return updated;
}
