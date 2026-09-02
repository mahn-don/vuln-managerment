import { prisma } from "@/lib/db/prisma";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { applicationService } from "@/modules/asset-management";
import { scopeVulnerabilityWhere } from "@/modules/platform-services/middleware/abac.middleware";

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    await applicationService.assertAccess(id, context.user);
    const vulnerabilities = await prisma.vulnerability.findMany({
      where: scopeVulnerabilityWhere(context.user, {
        vulnerabilityApplications: { some: { applicationId: id } },
      }),
      include: {
        assignee: { select: { displayName: true } },
        fixOwner: { select: { displayName: true } },
      },
      orderBy: [{ severity: "asc" }, { createdDate: "desc" }],
      take: 200,
    });
    return successResponse(vulnerabilities);
  },
  { permission: Permission.VIEW_ALL_APPLICATIONS }
);
