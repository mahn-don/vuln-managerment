import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma";
import {
  scopeAssessmentWhere,
  type UserContext,
} from "@/modules/platform-services/middleware/abac.middleware";


const TERMINAL_ASSESSMENT = ["DONE", "CANCELLED"];
const TERMINAL_VULN = ["CLOSED", "FALSE_POSITIVE", "DUPLICATE", "WONT_FIX"];

// Severity weights for workload scoring
const SEVERITY_WEIGHT: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

interface EngineerScore {
  userId: string;
  displayName: string;
  email: string;
  score: number;
  workloadScore: number;
  skillMatchScore: number;
  familiarityScore: number;
  activeAssessments: number;
  activeVulnerabilities: number;
  weightedWorkload: number;
  previousAssessmentsOnApp: number;
  reasoning: string[];
}

export interface AssignmentRecommendation {
  assessmentId: string;
  recommended: EngineerScore;
  alternatives: EngineerScore[];
  explanation: string;
  teamAvgWorkload: number;
}

class AssignmentRecommenderService {
  /**
   * Generate assignment recommendation for an assessment.
   */
  async recommend(assessmentId: string, user: UserContext): Promise<AssignmentRecommendation> {
    const assessment = await prisma.assessment.findFirst({
      where: scopeAssessmentWhere(user, { id: assessmentId }),
      include: {
        assessmentType: true,
        assessmentApplications: {
          include: {
            application: {
              select: { id: true, name: true, level: true, technologyStack: true, businessUnitId: true },
            },
          },
        },
      },
    });

    if (!assessment) throw new Error("Assessment not found");

    const primaryApp = assessment.assessmentApplications[0]?.application;

    // Get all active security engineers
    const engineers = await prisma.user.findMany({
      where: {
        role: { in: ["SECURITY_ENGINEER", "SECURITY_MANAGER"] },
        isActive: true,
      },
      select: { id: true, displayName: true, email: true },
    });

    if (engineers.length === 0) throw new Error("No active security engineers are available");

    const engineerIds = engineers.map((engineer) => engineer.id);
    const [assessmentWorkload, vulnerabilityWorkload, appExperience, typeExperience] = await Promise.all([
      prisma.assessment.groupBy({
        by: ["assigneeId", "priority"],
        where: {
          assigneeId: { in: engineerIds },
          status: { notIn: TERMINAL_ASSESSMENT },
        },
        _count: { _all: true },
      }),
      prisma.vulnerability.groupBy({
        by: ["assigneeId"],
        where: {
          assigneeId: { in: engineerIds },
          status: { notIn: TERMINAL_VULN },
        },
        _count: { _all: true },
      }),
      primaryApp
        ? prisma.assessment.groupBy({
            by: ["assigneeId"],
            where: {
              assigneeId: { in: engineerIds },
              assessmentApplications: { some: { applicationId: primaryApp.id } },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      prisma.assessment.groupBy({
        by: ["assigneeId"],
        where: {
          assigneeId: { in: engineerIds },
          assessmentTypeId: assessment.assessmentTypeId,
          status: "DONE",
        },
        _count: { _all: true },
      }),
    ]);

    const assessmentCounts = new Map<string, { count: number; weighted: number }>();
    for (const row of assessmentWorkload) {
      if (!row.assigneeId) continue;
      const current = assessmentCounts.get(row.assigneeId) || { count: 0, weighted: 0 };
      current.count += row._count._all;
      current.weighted += row._count._all * (SEVERITY_WEIGHT[row.priority || "MEDIUM"] || 2);
      assessmentCounts.set(row.assigneeId, current);
    }
    const vulnerabilityCounts = new Map(
      vulnerabilityWorkload.flatMap((row) => row.assigneeId ? [[row.assigneeId, row._count._all] as const] : [])
    );
    const familiarityCounts = new Map(
      appExperience.flatMap((row) => row.assigneeId ? [[row.assigneeId, row._count._all] as const] : [])
    );
    const typeExperienceCounts = new Map(
      typeExperience.flatMap((row) => row.assigneeId ? [[row.assigneeId, row._count._all] as const] : [])
    );

    const scores = engineers.map((engineer) => this.scoreEngineer(
      engineer,
      assessmentCounts.get(engineer.id) || { count: 0, weighted: 0 },
      vulnerabilityCounts.get(engineer.id) || 0,
      familiarityCounts.get(engineer.id) || 0,
      typeExperienceCounts.get(engineer.id) || 0
    ));

    // Sort by composite score descending
    scores.sort((a, b) => b.score - a.score);

    const teamAvgWorkload = scores.length > 0
      ? scores.reduce((sum, s) => sum + s.weightedWorkload, 0) / scores.length
      : 0;

    const explanation = this.buildExplanation(scores[0], scores, teamAvgWorkload, assessment.title);

    // Store recommendation
    await prisma.aIRecommendation.create({
      data: {
        type: "assignment",
        inputSummary: `Assignment for ${assessment.internalKey}: ${assessment.title}`,
        output: {
          recommended: scores[0]?.displayName,
          score: scores[0]?.score,
          alternatives: scores.slice(1, 3).map((s) => ({ name: s.displayName, score: s.score })),
        } as Prisma.InputJsonValue,
        confidence: scores[0]?.score ? scores[0].score / 100 : 0,
        status: "PENDING",
      },
    });

    return {
      assessmentId,
      recommended: scores[0],
      alternatives: scores.slice(1, 3),
      explanation,
      teamAvgWorkload,
    };
  }

  /**
   * Score a single engineer for an assessment.
   */
  private scoreEngineer(
    engineer: { id: string; displayName: string; email: string },
    assessmentWorkload: { count: number; weighted: number },
    activeVulns: number,
    previousAssessmentsOnApp: number,
    typeExperience: number
  ): EngineerScore {
    const reasoning: string[] = [];

    // 1. Workload score (lower workload = higher score)
    const weightedWorkload = assessmentWorkload.weighted + activeVulns;

    // Inverse workload: max 40 points, decreases with load
    const maxWorkload = 20;
    const workloadScore = Math.max(0, 40 * (1 - weightedWorkload / maxWorkload));
    reasoning.push(`Workload: ${assessmentWorkload.count} assessments, ${activeVulns} vulns (weighted: ${weightedWorkload})`);

    // 2. Application familiarity (max 30 points)
    const familiarityScore = Math.min(30, previousAssessmentsOnApp * 10);
    if (previousAssessmentsOnApp > 0) {
      reasoning.push(`Familiarity: assessed this application ${previousAssessmentsOnApp} time(s) before`);
    }

    // 3. Skill match (max 30 points) — based on assessment type experience
    const skillMatchScore = Math.min(30, typeExperience * 5);
    if (typeExperience > 0) {
      reasoning.push(`Experience: completed ${typeExperience} assessments of this type`);
    }

    const totalScore = Math.round(workloadScore + familiarityScore + skillMatchScore);

    return {
      userId: engineer.id,
      displayName: engineer.displayName,
      email: engineer.email,
      score: totalScore,
      workloadScore: Math.round(workloadScore),
      skillMatchScore,
      familiarityScore,
      activeAssessments: assessmentWorkload.count,
      activeVulnerabilities: activeVulns,
      weightedWorkload,
      previousAssessmentsOnApp,
      reasoning,
    };
  }

  /**
   * Build a deterministic explanation string.
   */
  private buildExplanation(
    recommended: EngineerScore | undefined,
    allScores: EngineerScore[],
    teamAvg: number,
    assessmentTitle: string
  ): string {
    if (!recommended) return "No engineers available for assignment.";

    const parts: string[] = [];
    parts.push(`Recommend assigning "${assessmentTitle}" to ${recommended.displayName} (score: ${recommended.score}/100).`);

    if (recommended.weightedWorkload < teamAvg) {
      parts.push(`Workload is below team average (${recommended.weightedWorkload} vs ${Math.round(teamAvg)} avg).`);
    }
    if (recommended.previousAssessmentsOnApp > 0) {
      parts.push(`Has assessed this application ${recommended.previousAssessmentsOnApp} time(s) before.`);
    }
    if (recommended.skillMatchScore > 0) {
      parts.push(`Has relevant experience with this assessment type.`);
    }

    return parts.join(" ");
  }

}

export const assignmentRecommender = new AssignmentRecommenderService();
