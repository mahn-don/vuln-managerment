import { prisma } from "@/lib/db/prisma";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { applicationService } from "@/modules/asset-management";
import { scopeAssessmentWhere } from "@/modules/platform-services/middleware/abac.middleware";

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    await applicationService.assertAccess(id, context.user);
    const assessments = await prisma.assessment.findMany({
      where: scopeAssessmentWhere(context.user, {
        assessmentApplications: { some: { applicationId: id } },
      }),
      include: {
        assessmentType: { select: { name: true, code: true } },
        assignee: { select: { displayName: true } },
        _count: { select: { vulnerabilities: true } },
      },
      orderBy: { createdDate: "desc" },
    });
    return successResponse(assessments);
  },
  { permission: Permission.VIEW_ALL_APPLICATIONS }
);
