import { prisma } from "@/lib/db/prisma";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { NotFoundError } from "@/lib/api/errors";
import {
  scopeAssessmentWhere,
  scopeVulnerabilityWhere,
} from "@/modules/platform-services/middleware/abac.middleware";

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const assessment = await prisma.assessment.findFirst({
      where: scopeAssessmentWhere(context.user, { id }),
      select: { id: true },
    });
    if (!assessment) throw new NotFoundError("Assessment", id);

    const vulnerabilities = await prisma.vulnerability.findMany({
      where: scopeVulnerabilityWhere(context.user, { sourceAssessmentId: id }),
      include: {
        assignee: { select: { displayName: true } },
        fixOwner: { select: { displayName: true } },
      },
      orderBy: [{ severity: "asc" }, { createdDate: "desc" }],
      take: 200,
    });
    return successResponse(vulnerabilities);
  },
  { permission: Permission.VIEW_ASSESSMENTS }
);
