import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma";
import type { UserContext } from "@/modules/platform-services/middleware/abac.middleware";

function vulnerabilityScopeSql(user: UserContext): Prisma.Sql {
  switch (user.role) {
    case "SECURITY_MANAGER":
      return user.businessUnitId
        ? Prisma.sql`AND EXISTS (
            SELECT 1
            FROM vulnerability_applications va
            JOIN applications app ON app.id = va.application_id
            WHERE va.vulnerability_id = v.id AND app.business_unit_id = ${user.businessUnitId}
          )`
        : Prisma.sql`AND FALSE`;
    case "APPLICATION_OWNER":
      return Prisma.sql`AND EXISTS (
        SELECT 1
        FROM vulnerability_applications va
        JOIN application_owners ao ON ao.application_id = va.application_id
        WHERE va.vulnerability_id = v.id AND ao.user_id = ${user.id}
      )`;
    case "DEVELOPER":
      return Prisma.sql`AND v.fix_owner_id = ${user.id}`;
    case "SYSTEM_ADMIN":
    case "SECURITY_ADMIN":
    case "SECURITY_ENGINEER":
    case "AUDITOR":
    case "EXECUTIVE":
    case "READ_ONLY":
      return Prisma.sql``;
    default:
      return Prisma.sql`AND FALSE`;
  }
}

function assessmentScopeSql(user: UserContext): Prisma.Sql {
  switch (user.role) {
    case "SECURITY_MANAGER":
      return user.businessUnitId
        ? Prisma.sql`AND EXISTS (
            SELECT 1
            FROM assessment_applications aa
            JOIN applications app ON app.id = aa.application_id
            WHERE aa.assessment_id = a.id AND app.business_unit_id = ${user.businessUnitId}
          )`
        : Prisma.sql`AND FALSE`;
    case "APPLICATION_OWNER":
      return Prisma.sql`AND EXISTS (
        SELECT 1
        FROM assessment_applications aa
        JOIN application_owners ao ON ao.application_id = aa.application_id
        WHERE aa.assessment_id = a.id AND ao.user_id = ${user.id}
      )`;
    case "SYSTEM_ADMIN":
    case "SECURITY_ADMIN":
    case "SECURITY_ENGINEER":
    case "AUDITOR":
    case "EXECUTIVE":
    case "READ_ONLY":
      return Prisma.sql``;
    default:
      return Prisma.sql`AND FALSE`;
  }
}

class AnalyticsService {
  private since(months: number): Date {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    return since;
  }

  async getMTTR(user: UserContext, months = 12) {
    const result = await prisma.$queryRaw<{ severity: string; avg_days: number; count: bigint }[]>(
      Prisma.sql`
        SELECT v.severity,
               AVG(EXTRACT(EPOCH FROM (v.closed_date - v.created_date)) / 86400)::numeric(10,1) AS avg_days,
               COUNT(*) AS count
        FROM vulnerabilities v
        WHERE v.closed_date IS NOT NULL
          AND v.created_date >= ${this.since(months)}
          ${vulnerabilityScopeSql(user)}
        GROUP BY v.severity
        ORDER BY CASE v.severity
          WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END
      `
    ).catch(() => []);
    return result.map((row) => ({
      severity: row.severity,
      avgDays: Number(row.avg_days),
      count: Number(row.count),
    }));
  }

  async getMTTRTrend(user: UserContext, months = 12) {
    const result = await prisma.$queryRaw<{ month: string; avg_days: number }[]>(
      Prisma.sql`
        SELECT TO_CHAR(v.closed_date, 'YYYY-MM') AS month,
               AVG(EXTRACT(EPOCH FROM (v.closed_date - v.created_date)) / 86400)::numeric(10,1) AS avg_days
        FROM vulnerabilities v
        WHERE v.closed_date IS NOT NULL AND v.created_date >= ${this.since(months)}
          ${vulnerabilityScopeSql(user)}
        GROUP BY TO_CHAR(v.closed_date, 'YYYY-MM')
        ORDER BY month
      `
    ).catch(() => []);
    return result.map((row) => ({ month: row.month, avgDays: Number(row.avg_days) }));
  }

  async getAssessmentThroughput(user: UserContext, months = 12) {
    const result = await prisma.$queryRaw<{ month: string; completed: bigint; avg_duration: number }[]>(
      Prisma.sql`
        SELECT TO_CHAR(a.completed_date, 'YYYY-MM') AS month,
               COUNT(*) AS completed,
               AVG(EXTRACT(EPOCH FROM (a.completed_date - a.started_date)) / 86400)::numeric(10,1) AS avg_duration
        FROM assessments a
        WHERE a.completed_date IS NOT NULL
          AND a.completed_date >= ${this.since(months)}
          AND a.status = 'DONE'
          ${assessmentScopeSql(user)}
        GROUP BY TO_CHAR(a.completed_date, 'YYYY-MM')
        ORDER BY month
      `
    ).catch(() => []);
    return result.map((row) => ({
      month: row.month,
      completed: Number(row.completed),
      avgDurationDays: Number(row.avg_duration),
    }));
  }

  async getVulnCreatedVsClosed(user: UserContext, months = 12) {
    const since = this.since(months);
    const [created, closed] = await Promise.all([
      prisma.$queryRaw<{ month: string; count: bigint }[]>(Prisma.sql`
        SELECT TO_CHAR(v.created_date, 'YYYY-MM') AS month, COUNT(*) AS count
        FROM vulnerabilities v
        WHERE v.created_date >= ${since}
          ${vulnerabilityScopeSql(user)}
        GROUP BY TO_CHAR(v.created_date, 'YYYY-MM')
        ORDER BY month
      `).catch(() => []),
      prisma.$queryRaw<{ month: string; count: bigint }[]>(Prisma.sql`
        SELECT TO_CHAR(v.closed_date, 'YYYY-MM') AS month, COUNT(*) AS count
        FROM vulnerabilities v
        WHERE v.closed_date IS NOT NULL AND v.closed_date >= ${since}
          ${vulnerabilityScopeSql(user)}
        GROUP BY TO_CHAR(v.closed_date, 'YYYY-MM')
        ORDER BY month
      `).catch(() => []),
    ]);

    const allMonths = new Set([...created.map((row) => row.month), ...closed.map((row) => row.month)]);
    const createdMap = new Map(created.map((row) => [row.month, Number(row.count)]));
    const closedMap = new Map(closed.map((row) => [row.month, Number(row.count)]));
    return Array.from(allMonths).sort().map((month) => ({
      month,
      created: createdMap.get(month) || 0,
      closed: closedMap.get(month) || 0,
      net: (createdMap.get(month) || 0) - (closedMap.get(month) || 0),
    }));
  }

  async getSLAComplianceTrend(user: UserContext, months = 12) {
    const result = await prisma.$queryRaw<{ month: string; compliance: number }[]>(Prisma.sql`
      SELECT TO_CHAR(v.updated_at, 'YYYY-MM') AS month,
             (100.0 * COUNT(*) FILTER (WHERE v.sla_status = 'MET') /
               NULLIF(COUNT(*) FILTER (WHERE v.sla_status IN ('MET', 'MISSED')), 0))::numeric(5,1) AS compliance
      FROM vulnerabilities v
      WHERE v.updated_at >= ${this.since(months)}
        AND v.sla_status IN ('MET', 'MISSED')
        ${vulnerabilityScopeSql(user)}
      GROUP BY TO_CHAR(v.updated_at, 'YYYY-MM')
      ORDER BY month
    `).catch(() => []);
    return result.map((row) => ({ month: row.month, compliance: Number(row.compliance) }));
  }

  async getVulnAging(user: UserContext) {
    const result = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>(Prisma.sql`
      SELECT CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - v.created_date)) / 86400 <= 7 THEN '0-7 days'
          WHEN EXTRACT(EPOCH FROM (NOW() - v.created_date)) / 86400 <= 30 THEN '8-30 days'
          WHEN EXTRACT(EPOCH FROM (NOW() - v.created_date)) / 86400 <= 60 THEN '31-60 days'
          WHEN EXTRACT(EPOCH FROM (NOW() - v.created_date)) / 86400 <= 90 THEN '61-90 days'
          ELSE '90+ days'
        END AS bucket,
        COUNT(*) AS count
      FROM vulnerabilities v
      WHERE v.status NOT IN ('CLOSED', 'FALSE_POSITIVE', 'DUPLICATE', 'WONT_FIX')
        ${vulnerabilityScopeSql(user)}
      GROUP BY bucket
      ORDER BY MIN(EXTRACT(EPOCH FROM (NOW() - v.created_date)))
    `).catch(() => []);
    return result.map((row) => ({ bucket: row.bucket, count: Number(row.count) }));
  }

  async getFullAnalytics(user: UserContext, months = 12) {
    const [mttr, mttrTrend, throughput, createdVsClosed, slaCompliance, aging] = await Promise.all([
      this.getMTTR(user, months),
      this.getMTTRTrend(user, months),
      this.getAssessmentThroughput(user, months),
      this.getVulnCreatedVsClosed(user, months),
      this.getSLAComplianceTrend(user, months),
      this.getVulnAging(user),
    ]);
    return { mttr, mttrTrend, throughput, createdVsClosed, slaCompliance, aging };
  }
}

export const analyticsService = new AnalyticsService();
