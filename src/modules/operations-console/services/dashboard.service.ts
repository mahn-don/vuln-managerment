import { prisma } from "@/lib/db/prisma";
import { cacheWrap } from "@/lib/redis/cache";
import { Prisma } from "@/generated/prisma";
import {
  getApplicationScopeFilter,
  getAssessmentScopeFilter,
  getVulnerabilityScopeFilter,
  scopeApplicationWhere,
  scopeAssessmentWhere,
  scopeVulnerabilityWhere,
  type UserContext,
} from "@/modules/platform-services/middleware/abac.middleware";

const TERMINAL_VULN_STATUSES = ["CLOSED", "FALSE_POSITIVE", "DUPLICATE", "WONT_FIX"];
const TERMINAL_ASSESSMENT_STATUSES = ["DONE", "CANCELLED"];

/**
 * The reporting window every figure on a dashboard is computed over.
 *
 * `from`/`to` are ISO dates (YYYY-MM-DD) from the filter strip. `to` is pushed
 * to the end of that day so an inclusive range reads the way a user expects.
 */
export type DashboardRange = { from?: string; to?: string };

export function dateFilter(range?: DashboardRange) {
  if (!range?.from && !range?.to) return undefined;
  const filter: { gte?: Date; lte?: Date } = {};
  if (range.from) filter.gte = new Date(range.from + "T00:00:00.000Z");
  if (range.to) filter.lte = new Date(range.to + "T23:59:59.999Z");
  return filter;
}

/** Cache key must vary with the window or every range returns the first one. */
function rangeKey(range?: DashboardRange) {
  return `${range?.from ?? "*"}:${range?.to ?? "*"}`;
}

function userScopeKey(user: UserContext) {
  if (user.role === "SECURITY_MANAGER") return `bu:${user.businessUnitId || "none"}`;
  if (["APPLICATION_OWNER", "DEVELOPER"].includes(user.role)) return `user:${user.id}`;
  return "global";
}

class DashboardService {
  async getExecutiveDashboard(user: UserContext, range?: DashboardRange) {
    return cacheWrap(`dashboard:executive:${userScopeKey(user)}:${rangeKey(range)}`, 60, () =>
      this._computeExecutiveDashboard(user, range),
    );
  }

  private async _computeExecutiveDashboard(user: UserContext, range?: DashboardRange) {
    const created = dateFilter(range);
    const vulnWindow = created ? { createdDate: created } : {};
    const appWindow = created ? { createdAt: created } : {};
    const [
      totalApplications,
      applicationsWithAssessment,
      internetFacingApplications,
      applicationsNeverAssessed,
      overduAssessments,
      openVulnerabilities,
      vulnBySeverity,
      slaCompliance,
      recentVulnTrend,
      freshness,
    ] = await Promise.all([
      // Total applications
      prisma.application.count({ where: scopeApplicationWhere(user, { status: "ACTIVE", ...appWindow }) }),

      // Applications with at least one assessment
      prisma.application.count({
        where: scopeApplicationWhere(user, {
          status: "ACTIVE",
          lastAssessmentDate: { not: null },
          ...appWindow,
        }),
      }),

      // Internet-facing applications: the exposure question the board asks first,
      // and the multiplier on every other figure here.
      prisma.application.count({
        where: scopeApplicationWhere(user, { status: "ACTIVE", internetFacing: true, ...appWindow }),
      }),

      // Applications never assessed
      prisma.application.count({
        where: scopeApplicationWhere(user, {
          status: "ACTIVE",
          lastAssessmentDate: null,
          ...appWindow,
        }),
      }),

      // Overdue assessments
      prisma.application.count({
        where: scopeApplicationWhere(user, {
          status: "ACTIVE",
          nextAssessmentDue: { lt: new Date() },
          ...appWindow,
        }),
      }),

      // Open vulnerabilities
      prisma.vulnerability.count({
        where: scopeVulnerabilityWhere(user, { status: { notIn: TERMINAL_VULN_STATUSES }, ...vulnWindow }),
      }),

      // Vulnerabilities by severity (open)
      prisma.vulnerability.groupBy({
        by: ["severity"],
        where: scopeVulnerabilityWhere(user, { status: { notIn: TERMINAL_VULN_STATUSES }, ...vulnWindow }),
        _count: true,
      }),

      // SLA compliance (resolved vulns that met SLA / total resolved)
      Promise.all([
        prisma.vulnerability.count({ where: scopeVulnerabilityWhere(user, { slaStatus: "MET", ...vulnWindow }) }),
        prisma.vulnerability.count({
          where: scopeVulnerabilityWhere(user, { slaStatus: { in: ["MET", "MISSED"] }, ...vulnWindow }),
        }),
      ]),

      // Vulnerability trend, new per month across the selected window
      getVulnerabilityScopeFilter(user) ? Promise.resolve([]) : prisma.$queryRaw<{ month: string; count: bigint }[]>(
        Prisma.sql`
        SELECT TO_CHAR(created_date, 'YYYY-MM') as month, COUNT(*) as count
        FROM vulnerabilities
        WHERE created_date >= ${created?.gte ?? Prisma.sql`NOW() - INTERVAL '6 months'`}
          AND created_date <= ${created?.lte ?? Prisma.sql`NOW()`}
        GROUP BY TO_CHAR(created_date, 'YYYY-MM')
        ORDER BY month
      `).catch(() => []),

      // Freshness, for the provenance line under each figure
      prisma.vulnerability.aggregate({
        where: scopeVulnerabilityWhere(user),
        _max: { lastSyncedAt: true },
      }),
    ]);

    const severityMap = vulnBySeverity.reduce(
      (acc, v) => ({ ...acc, [v.severity]: v._count }),
      {} as Record<string, number>
    );

    const [slaMet, slaTotal] = slaCompliance;
    const slaRate = slaTotal > 0 ? Math.round((slaMet / slaTotal) * 100) : 100;

    const assessmentCoverage = totalApplications > 0
      ? Math.round((applicationsWithAssessment / totalApplications) * 100)
      : 0;

    return {
      kpis: {
        totalApplications,
        assessmentCoverage,
        internetFacingApplications,
        internalOnlyApplications: Math.max(totalApplications - internetFacingApplications, 0),
        applicationsNeverAssessed,
        overdueAssessments: overduAssessments,
        openVulnerabilities,
        criticalOpen: severityMap.CRITICAL || 0,
        highOpen: severityMap.HIGH || 0,
        mediumOpen: severityMap.MEDIUM || 0,
        lowOpen: severityMap.LOW || 0,
        slaCompliance: slaRate,
      },
      charts: {
        vulnBySeverity: severityMap,
        vulnTrend: recentVulnTrend.map((r) => ({
          month: r.month,
          count: Number(r.count),
        })),
      },
      provenance: {
        lastSyncedAt: freshness._max.lastSyncedAt?.toISOString() ?? null,
        vulnerabilitiesCounted: openVulnerabilities,
        applicationsCounted: totalApplications,
      },
    };
  }

  async getOperationsDashboard(user: UserContext, range?: DashboardRange) {
    return cacheWrap(`dashboard:operations:${userScopeKey(user)}:${rangeKey(range)}`, 60, () =>
      this._computeOperationsDashboard(user, range),
    );
  }

  private async _computeOperationsDashboard(user: UserContext, range?: DashboardRange) {
    const created = dateFilter(range);
    const vulnWindow = created ? { createdDate: created } : {};
    const assessmentWindow = created ? { createdDate: created } : {};
    const [
      assessmentBacklog,
      waitingAssignment,
      inProgress,
      newVulnsThisWeek,
      slaBreaches,
      approachingSLA,
      verificationBacklog,
      assessmentsByStatus,
      workloadByEngineer,
    ] = await Promise.all([
      // Assessment backlog
      prisma.assessment.count({
        where: scopeAssessmentWhere(user, { status: { notIn: TERMINAL_ASSESSMENT_STATUSES }, ...assessmentWindow }),
      }),

      // Waiting assignment
      prisma.assessment.count({
        where: scopeAssessmentWhere(user, { status: "QUEUED", ...assessmentWindow }),
      }),

      // In progress
      prisma.assessment.count({
        where: scopeAssessmentWhere(user, { status: "IN_PROGRESS", ...assessmentWindow }),
      }),

      // New vulnerabilities raised in the window (last 7 days when unset)
      prisma.vulnerability.count({
        where: scopeVulnerabilityWhere(user, {
          createdDate: created ?? { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }),
      }),

      // Active SLA breaches
      prisma.vulnerability.count({
        where: scopeVulnerabilityWhere(user, {
          slaStatus: "BREACHED",
          status: { notIn: TERMINAL_VULN_STATUSES },
          ...vulnWindow,
        }),
      }),

      // Approaching SLA (within 7 days)
      prisma.vulnerability.count({
        where: scopeVulnerabilityWhere(user, {
          slaStatus: "AT_RISK",
          status: { notIn: TERMINAL_VULN_STATUSES },
          ...vulnWindow,
        }),
      }),

      // Verification backlog
      prisma.vulnerability.count({
        where: scopeVulnerabilityWhere(user, { status: "READY_FOR_VERIFICATION", ...vulnWindow }),
      }),

      // Assessments by status
      prisma.assessment.groupBy({
        by: ["status"],
        where: scopeAssessmentWhere(user, assessmentWindow),
        _count: true,
      }),

      // Workload by engineer (active assessments + open vulns)
      prisma.user.findMany({
        where: {
          role: { in: ["SECURITY_ENGINEER", "SECURITY_MANAGER"] },
          isActive: true,
          ...(getAssessmentScopeFilter(user) || getVulnerabilityScopeFilter(user)
            ? {
                OR: [
                  { assignedAssessments: { some: scopeAssessmentWhere(user, assessmentWindow) } },
                  { assignedVulnerabilities: { some: scopeVulnerabilityWhere(user, vulnWindow) } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          displayName: true,
          _count: {
            select: {
              assignedAssessments: {
                where: scopeAssessmentWhere(user, { status: { notIn: TERMINAL_ASSESSMENT_STATUSES }, ...assessmentWindow }),
              },
              assignedVulnerabilities: {
                where: scopeVulnerabilityWhere(user, { status: { notIn: TERMINAL_VULN_STATUSES }, ...vulnWindow }),
              },
            },
          },
        },
      }),
    ]);

    return {
      kpis: {
        assessmentBacklog,
        waitingAssignment,
        inProgress,
        newVulnsThisWeek,
        slaBreaches,
        approachingSLA,
        verificationBacklog,
      },
      charts: {
        assessmentsByStatus: assessmentsByStatus.reduce(
          (acc, a) => ({ ...acc, [a.status]: a._count }),
          {} as Record<string, number>
        ),
        workloadByEngineer: workloadByEngineer.map((e) => ({
          name: e.displayName,
          assessments: e._count.assignedAssessments,
          vulnerabilities: e._count.assignedVulnerabilities,
        })),
      },
    };
  }
}

export const dashboardService = new DashboardService();
