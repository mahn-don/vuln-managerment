import { prisma } from "@/lib/db/prisma";

/**
 * Predefined metric queries mapped to natural language intents.
 * These are deterministic, always-accurate queries that bypass LLM generation.
 */

export interface MetricResult {
  value: unknown;
  label: string;
  source: string;
  query: string;
  period?: string;
}

type MetricHandler = (params: Record<string, string>) => Promise<MetricResult>;

const TERMINAL_VULN = ["CLOSED", "FALSE_POSITIVE", "DUPLICATE", "WONT_FIX"];
const TERMINAL_ASSESSMENT = ["DONE", "CANCELLED"];

export const predefinedMetrics: Record<string, { patterns: RegExp[]; handler: MetricHandler }> = {
  open_vuln_count: {
    patterns: [
      /how many (vulnerabilities|vulns|findings) are (open|active)/i,
      /total open (vulnerabilities|vulns|findings)/i,
      /open (vulnerability|vuln|finding) count/i,
    ],
    handler: async () => {
      const count = await prisma.vulnerability.count({
        where: { status: { notIn: TERMINAL_VULN } },
      });
      return {
        value: count,
        label: `${count} open vulnerabilities`,
        source: "Vulnerability table",
        query: "COUNT(*) FROM vulnerabilities WHERE status NOT IN terminal",
      };
    },
  },

  open_vuln_by_severity: {
    patterns: [
      /how many (critical|high|medium|low) (vulnerabilities|vulns|findings)/i,
      /(critical|high|medium|low) (vulnerability|vuln|finding) count/i,
    ],
    handler: async (params) => {
      const severity = (params.severity || "CRITICAL").toUpperCase();
      const count = await prisma.vulnerability.count({
        where: { severity: severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", status: { notIn: TERMINAL_VULN } },
      });
      return {
        value: count,
        label: `${count} open ${severity.toLowerCase()} vulnerabilities`,
        source: "Vulnerability table",
        query: `COUNT(*) FROM vulnerabilities WHERE severity='${severity}' AND status NOT IN terminal`,
      };
    },
  },

  vuln_created_in_period: {
    patterns: [
      /how many (vulnerabilities|vulns|findings) (were |)(created|opened|discovered) in (\w+)/i,
      /vulnerabilities created (this|last) (month|week|quarter)/i,
      /(new|created) (vulnerabilities|vulns) (in|this|last) (\w+)/i,
    ],
    handler: async (params) => {
      const period = params.period || "month";
      const { start, end, label } = resolvePeriod(period);
      const count = await prisma.vulnerability.count({
        where: { createdDate: { gte: start, lte: end } },
      });
      return {
        value: count,
        label: `${count} vulnerabilities created in ${label}`,
        source: "Vulnerability table",
        query: `COUNT(*) FROM vulnerabilities WHERE created_date BETWEEN '${start.toISOString()}' AND '${end.toISOString()}'`,
        period: label,
      };
    },
  },

  sla_breached_count: {
    patterns: [
      /how many (vulnerabilities|vulns|findings) (have |are |)(breached|overdue|past) sla/i,
      /sla breach(es|ed)? count/i,
      /(active|current) sla breach/i,
    ],
    handler: async () => {
      const count = await prisma.vulnerability.count({
        where: { slaStatus: "BREACHED", status: { notIn: TERMINAL_VULN } },
      });
      return {
        value: count,
        label: `${count} vulnerabilities have breached SLA`,
        source: "Vulnerability table",
        query: "COUNT(*) FROM vulnerabilities WHERE sla_status='BREACHED' AND open",
      };
    },
  },

  assessment_backlog: {
    patterns: [
      /how many assessments are (pending|waiting|in backlog|queued)/i,
      /assessment (backlog|queue)/i,
      /waiting (for |)assignment/i,
    ],
    handler: async () => {
      const total = await prisma.assessment.count({
        where: { status: { notIn: TERMINAL_ASSESSMENT } },
      });
      const waiting = await prisma.assessment.count({
        where: { status: "QUEUED" },
      });
      return {
        value: { total, waitingAssignment: waiting },
        label: `${total} active assessments (${waiting} waiting for assignment)`,
        source: "Assessment table",
        query: "COUNT(*) FROM assessments WHERE status NOT IN terminal",
      };
    },
  },

  app_never_assessed: {
    patterns: [
      /which (applications|apps) have (not |never )(been |)assessed/i,
      /applications (without|with no|lacking) assessment/i,
      /never assessed/i,
    ],
    handler: async () => {
      const apps = await prisma.application.findMany({
        where: { status: "ACTIVE", lastAssessmentDate: null },
        select: { name: true, applicationId: true, level: true },
        orderBy: { level: "asc" },
        take: 20,
      });
      return {
        value: { count: apps.length, applications: apps },
        label: `${apps.length} active applications have never been assessed`,
        source: "Application table",
        query: "SELECT * FROM applications WHERE status='ACTIVE' AND last_assessment_date IS NULL",
      };
    },
  },

  overdue_assessments: {
    patterns: [
      /which assessments are overdue/i,
      /overdue (security |)assessments/i,
      /assessments past (due|deadline)/i,
    ],
    handler: async () => {
      const apps = await prisma.application.findMany({
        where: { status: "ACTIVE", nextAssessmentDue: { lt: new Date() } },
        select: { name: true, applicationId: true, nextAssessmentDue: true, level: true },
        orderBy: { nextAssessmentDue: "asc" },
        take: 20,
      });
      return {
        value: { count: apps.length, applications: apps },
        label: `${apps.length} applications have overdue assessments`,
        source: "Application table",
        query: "SELECT * FROM applications WHERE next_assessment_due < NOW()",
      };
    },
  },

  top_risky_apps: {
    patterns: [
      /which (applications|apps) have (the |)most (vulnerabilities|vulns|findings)/i,
      /top (risk|risky|vulnerable) (applications|apps)/i,
      /highest (vulnerability|vuln) count/i,
    ],
    handler: async () => {
      const apps = await prisma.application.findMany({
        where: { status: "ACTIVE", openVulnerabilityCount: { gt: 0 } },
        select: {
          name: true,
          applicationId: true,
          openVulnerabilityCount: true,
          openCriticalCount: true,
          openHighCount: true,
        },
        orderBy: [{ openCriticalCount: "desc" }, { openVulnerabilityCount: "desc" }],
        take: 10,
      });
      return {
        value: apps,
        label: `Top ${apps.length} applications by open vulnerability count`,
        source: "Application table",
        query: "SELECT * FROM applications WHERE open_vulnerability_count > 0 ORDER BY critical DESC",
      };
    },
  },

  engineer_workload: {
    patterns: [
      /who (has |)(the |)(highest|most) workload/i,
      /engineer workload/i,
      /team (workload|capacity)/i,
    ],
    handler: async () => {
      const engineers = await prisma.user.findMany({
        where: { role: { in: ["SECURITY_ENGINEER", "SECURITY_MANAGER"] }, isActive: true },
        select: {
          displayName: true,
          _count: {
            select: {
              assignedAssessments: { where: { status: { notIn: TERMINAL_ASSESSMENT } } },
              assignedVulnerabilities: { where: { status: { notIn: TERMINAL_VULN } } },
            },
          },
        },
        orderBy: { displayName: "asc" },
      });

      const workloads = engineers.map((e) => ({
        name: e.displayName,
        assessments: e._count.assignedAssessments,
        vulnerabilities: e._count.assignedVulnerabilities,
        total: e._count.assignedAssessments + e._count.assignedVulnerabilities,
      }));
      workloads.sort((a, b) => b.total - a.total);

      return {
        value: workloads,
        label: workloads.length > 0
          ? `${workloads[0].name} has the highest workload (${workloads[0].total} active items)`
          : "No engineers with active workload",
        source: "User + Assessment + Vulnerability tables",
        query: "Aggregate active assignments per engineer",
      };
    },
  },

  total_applications: {
    patterns: [
      /how many (applications|apps|systems)/i,
      /total (application|app) count/i,
    ],
    handler: async () => {
      const count = await prisma.application.count({ where: { status: "ACTIVE" } });
      return {
        value: count,
        label: `${count} active applications in inventory`,
        source: "Application table",
        query: "COUNT(*) FROM applications WHERE status='ACTIVE'",
      };
    },
  },

  sla_compliance: {
    patterns: [
      /sla compliance/i,
      /what is (the |our |)sla (compliance|rate)/i,
    ],
    handler: async () => {
      const met = await prisma.vulnerability.count({ where: { slaStatus: "MET" } });
      const total = await prisma.vulnerability.count({ where: { slaStatus: { in: ["MET", "MISSED"] } } });
      const rate = total > 0 ? Math.round((met / total) * 100) : 100;
      return {
        value: { rate, met, missed: total - met, total },
        label: `SLA compliance rate is ${rate}% (${met} met, ${total - met} missed out of ${total} resolved)`,
        source: "Vulnerability table",
        query: "COUNT(sla_status='MET') / COUNT(sla_status IN ('MET','MISSED'))",
      };
    },
  },
};

/**
 * Resolve a period name (e.g., "august", "this month", "last quarter") into date range.
 */
function resolvePeriod(period: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];

  const lowerPeriod = period.toLowerCase().trim();

  // Check for month name
  const monthIdx = months.indexOf(lowerPeriod);
  if (monthIdx !== -1) {
    const year = monthIdx > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
    return {
      start: new Date(year, monthIdx, 1),
      end: new Date(year, monthIdx + 1, 0, 23, 59, 59),
      label: `${months[monthIdx].charAt(0).toUpperCase() + months[monthIdx].slice(1)} ${year}`,
    };
  }

  // This month
  if (lowerPeriod.includes("this month") || lowerPeriod === "month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: now,
      label: `this month (${months[now.getMonth()]} ${now.getFullYear()})`,
    };
  }

  // Last month
  if (lowerPeriod.includes("last month")) {
    const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return {
      start: new Date(year, lastMonth, 1),
      end: new Date(year, lastMonth + 1, 0, 23, 59, 59),
      label: `last month (${months[lastMonth]} ${year})`,
    };
  }

  // This week
  if (lowerPeriod.includes("this week") || lowerPeriod === "week") {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return { start: weekStart, end: now, label: "this week" };
  }

  // Default: last 30 days
  return {
    start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    end: now,
    label: "last 30 days",
  };
}
