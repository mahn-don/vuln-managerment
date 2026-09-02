import { prisma } from "@/lib/db/prisma";
import { aiGateway } from "./ai-gateway.service";
import { createChildLogger } from "@/lib/logger";
import { cacheWrap } from "@/lib/redis/cache";
import {
  scopeApplicationWhere,
  scopeAssessmentWhere,
  scopeVulnerabilityWhere,
  type UserContext,
} from "@/modules/platform-services/middleware/abac.middleware";

const logger = createChildLogger("daily-brief");

const TERMINAL_VULN = ["CLOSED", "FALSE_POSITIVE", "DUPLICATE", "WONT_FIX"];
const TERMINAL_ASSESSMENT = ["DONE", "CANCELLED"];

export interface DailyBrief {
  date: string;
  metrics: {
    newVulnerabilities: number;
    newCritical: number;
    newHigh: number;
    overdueFindings: number;
    slaBreaches: number;
    approachingSLA: number;
    waitingAssignment: number;
    completedYesterday: number;
    totalOpenVulns: number;
    assessmentBacklog: number;
  };
  topRiskApps: { name: string; criticalCount: number; highCount: number; totalOpen: number }[];
  aiInsights: string[];
  generatedAt: string;
}

class DailyBriefService {
  /**
   * Generate the daily security brief.
   * Metrics are always deterministic. AI insights are optional.
   */
  async generate(user: UserContext): Promise<DailyBrief> {
    const scopeKey = user.role === "SECURITY_MANAGER"
      ? `bu:${user.businessUnitId || "none"}`
      : ["APPLICATION_OWNER", "DEVELOPER"].includes(user.role)
        ? `user:${user.id}`
        : "global";
    const date = new Date().toISOString().split("T")[0];
    return cacheWrap(`daily-brief:${scopeKey}:${date}`, 300, () => this.compute(user));
  }

  private async compute(user: UserContext): Promise<DailyBrief> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // All metrics queries in parallel
    const [
      newVulns24h,
      newCritical24h,
      newHigh24h,
      overdueFindings,
      slaBreaches,
      approachingSLA,
      waitingAssignment,
      completedYesterday,
      totalOpenVulns,
      assessmentBacklog,
      topRiskApps,
    ] = await Promise.all([
      prisma.vulnerability.count({ where: scopeVulnerabilityWhere(user, { createdDate: { gte: yesterday } }) }),
      prisma.vulnerability.count({ where: scopeVulnerabilityWhere(user, { createdDate: { gte: yesterday }, severity: "CRITICAL" }) }),
      prisma.vulnerability.count({ where: scopeVulnerabilityWhere(user, { createdDate: { gte: yesterday }, severity: "HIGH" }) }),
      prisma.vulnerability.count({
        where: scopeVulnerabilityWhere(user, {
          dueDate: { lt: now },
          status: { notIn: TERMINAL_VULN },
        }),
      }),
      prisma.vulnerability.count({ where: scopeVulnerabilityWhere(user, { slaStatus: "BREACHED", status: { notIn: TERMINAL_VULN } }) }),
      prisma.vulnerability.count({ where: scopeVulnerabilityWhere(user, { slaStatus: "AT_RISK", status: { notIn: TERMINAL_VULN } }) }),
      prisma.assessment.count({ where: scopeAssessmentWhere(user, { status: "QUEUED" }) }),
      prisma.assessment.count({
        where: scopeAssessmentWhere(user, { status: "DONE", completedDate: { gte: yesterday } }),
      }),
      prisma.vulnerability.count({ where: scopeVulnerabilityWhere(user, { status: { notIn: TERMINAL_VULN } }) }),
      prisma.assessment.count({ where: scopeAssessmentWhere(user, { status: { notIn: TERMINAL_ASSESSMENT } }) }),
      prisma.application.findMany({
        where: scopeApplicationWhere(user, { status: "ACTIVE", openCriticalCount: { gt: 0 } }),
        select: { name: true, openCriticalCount: true, openHighCount: true, openVulnerabilityCount: true },
        orderBy: [{ openCriticalCount: "desc" }, { openVulnerabilityCount: "desc" }],
        take: 5,
      }),
    ]);

    const metrics = {
      newVulnerabilities: newVulns24h,
      newCritical: newCritical24h,
      newHigh: newHigh24h,
      overdueFindings,
      slaBreaches,
      approachingSLA,
      waitingAssignment,
      completedYesterday,
      totalOpenVulns,
      assessmentBacklog,
    };

    const topApps = topRiskApps.map((a) => ({
      name: a.name,
      criticalCount: a.openCriticalCount,
      highCount: a.openHighCount,
      totalOpen: a.openVulnerabilityCount,
    }));

    // Generate AI insights if available
    let aiInsights: string[] = [];
    if (await aiGateway.isConfigured) {
      try {
        aiInsights = await this.generateInsights(metrics, topApps);
      } catch (error) {
        logger.error({ error: (error as Error).message }, "Failed to generate AI insights for brief");
      }
    }

    // Fallback deterministic insights if AI unavailable
    if (aiInsights.length === 0) {
      aiInsights = this.generateDeterministicInsights(metrics, topApps);
    }

    return {
      date: now.toISOString().split("T")[0],
      metrics,
      topRiskApps: topApps,
      aiInsights,
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Ask AI to generate actionable insights from the metrics.
   */
  private async generateInsights(
    metrics: DailyBrief["metrics"],
    topApps: DailyBrief["topRiskApps"]
  ): Promise<string[]> {
    const response = await aiGateway.chat({
      type: "daily_brief",
      promptTemplate: "daily-brief-v1",
      systemPrompt: `You are a security operations analyst. Generate 3-5 brief, actionable insights from the daily security metrics. Each insight should be one sentence. Focus on what needs attention, trends, and recommendations. Only reference data provided — do not invent metrics.

Respond as a JSON array of strings.`,
      userPrompt: `Today's Security Metrics:
- New vulnerabilities (24h): ${metrics.newVulnerabilities} (${metrics.newCritical} Critical, ${metrics.newHigh} High)
- Total open vulnerabilities: ${metrics.totalOpenVulns}
- SLA breaches (active): ${metrics.slaBreaches}
- Approaching SLA: ${metrics.approachingSLA}
- Overdue findings: ${metrics.overdueFindings}
- Assessments waiting assignment: ${metrics.waitingAssignment}
- Assessments completed yesterday: ${metrics.completedYesterday}
- Assessment backlog: ${metrics.assessmentBacklog}

Top risk applications:
${topApps.map((a, index) => `- Application ${index + 1}: ${a.criticalCount} Critical, ${a.highCount} High, ${a.totalOpen} total open`).join("\n")}`,
      maxTokens: 400,
      temperature: 0.4,
    });

    const parsed = aiGateway.parseJSON<string[]>(response.content);
    return parsed || [];
  }

  /**
   * Generate deterministic insights when AI is unavailable.
   */
  private generateDeterministicInsights(
    metrics: DailyBrief["metrics"],
    topApps: DailyBrief["topRiskApps"]
  ): string[] {
    const insights: string[] = [];

    if (metrics.newCritical > 0) {
      insights.push(`${metrics.newCritical} new Critical vulnerabilities discovered in the last 24 hours — immediate attention required.`);
    }

    if (metrics.slaBreaches > 0) {
      insights.push(`${metrics.slaBreaches} vulnerabilities have breached SLA and need escalation.`);
    }

    if (metrics.approachingSLA > 5) {
      insights.push(`${metrics.approachingSLA} vulnerabilities are approaching SLA — prioritize these to avoid further breaches.`);
    }

    if (metrics.waitingAssignment > 3) {
      insights.push(`${metrics.waitingAssignment} assessments are waiting for assignment — consider distributing workload.`);
    }

    if (topApps.length > 0) {
      const worst = topApps[0];
      insights.push(`${worst.name} has the highest risk with ${worst.criticalCount} Critical and ${worst.highCount} High open vulnerabilities.`);
    }

    if (insights.length === 0) {
      insights.push("No critical items requiring immediate attention today.");
    }

    return insights;
  }
}

export const dailyBriefService = new DailyBriefService();
