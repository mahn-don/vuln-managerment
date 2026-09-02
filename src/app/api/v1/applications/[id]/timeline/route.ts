import { prisma } from "@/lib/db/prisma";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { applicationService } from "@/modules/asset-management";
import {
  scopeAssessmentWhere,
  scopeVulnerabilityWhere,
} from "@/modules/platform-services/middleware/abac.middleware";

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    await applicationService.assertAccess(id, context.user);

    // Collect events from multiple sources
    const [assessmentEvents, vulnEvents, statusEvents] = await Promise.all([
      // Assessment events linked to this application
      prisma.assessment.findMany({
        where: scopeAssessmentWhere(context.user, {
          assessmentApplications: { some: { applicationId: id } },
        }),
        select: {
          id: true,
          internalKey: true,
          title: true,
          status: true,
          createdDate: true,
          completedDate: true,
          assessmentType: { select: { name: true } },
        },
        orderBy: { createdDate: "desc" },
        take: 20,
      }),

      // Vulnerability events linked to this application
      prisma.vulnerability.findMany({
        where: scopeVulnerabilityWhere(context.user, {
          vulnerabilityApplications: { some: { applicationId: id } },
        }),
        select: {
          id: true,
          internalKey: true,
          title: true,
          severity: true,
          status: true,
          createdDate: true,
          closedDate: true,
        },
        orderBy: { createdDate: "desc" },
        take: 20,
      }),

      // Status changes for assessments and vulns linked to this app
      prisma.statusHistory.findMany({
        where: {
          OR: [
            {
              entityType: "ASSESSMENT",
              entityId: {
                in: await prisma.assessmentApplication
                  .findMany({ where: { applicationId: id }, select: { assessmentId: true } })
                  .then((r) => r.map((a) => a.assessmentId)),
              },
            },
            {
              entityType: "VULNERABILITY",
              entityId: {
                in: await prisma.vulnerabilityApplication
                  .findMany({ where: { applicationId: id }, select: { vulnerabilityId: true } })
                  .then((r) => r.map((v) => v.vulnerabilityId)),
              },
            },
          ],
        },
        include: { changedBy: { select: { displayName: true } } },
        orderBy: { changedAt: "desc" },
        take: 30,
      }),
    ]);

    // Merge into unified timeline
    type TimelineEvent = {
      timestamp: string;
      type: string;
      entityType: string;
      entityId: string;
      entityKey: string;
      title: string;
      details: string;
      user?: string;
    };

    const events: TimelineEvent[] = [];

    for (const a of assessmentEvents) {
      events.push({
        timestamp: a.createdDate.toISOString(),
        type: "created",
        entityType: "assessment",
        entityId: a.id,
        entityKey: a.internalKey,
        title: `Assessment requested: ${a.title}`,
        details: a.assessmentType?.name || "",
      });
      if (a.completedDate) {
        events.push({
          timestamp: a.completedDate.toISOString(),
          type: "completed",
          entityType: "assessment",
          entityId: a.id,
          entityKey: a.internalKey,
          title: `Assessment completed: ${a.title}`,
          details: `Final status: ${a.status}`,
        });
      }
    }

    for (const v of vulnEvents) {
      events.push({
        timestamp: v.createdDate.toISOString(),
        type: "created",
        entityType: "vulnerability",
        entityId: v.id,
        entityKey: v.internalKey,
        title: `Vulnerability discovered: ${v.title}`,
        details: `Severity: ${v.severity}`,
      });
      if (v.closedDate) {
        events.push({
          timestamp: v.closedDate.toISOString(),
          type: "resolved",
          entityType: "vulnerability",
          entityId: v.id,
          entityKey: v.internalKey,
          title: `Vulnerability resolved: ${v.title}`,
          details: `Status: ${v.status}`,
        });
      }
    }

    for (const s of statusEvents) {
      events.push({
        timestamp: s.changedAt.toISOString(),
        type: "status_change",
        entityType: s.entityType.toLowerCase(),
        entityId: s.entityId,
        entityKey: "",
        title: `Status: ${s.fromStatus || "Initial"} → ${s.toStatus}`,
        details: s.reason || "",
        user: s.changedBy?.displayName,
      });
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return successResponse(events.slice(0, 50));
  },
  { permission: Permission.VIEW_ALL_APPLICATIONS }
);
