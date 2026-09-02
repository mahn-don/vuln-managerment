import { vulnerabilityService, createRiskAcceptanceSchema } from "@/modules/vulnerability-management";
import { createHandler, validateBody, successResponse, createdResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { prisma } from "@/lib/db/prisma";

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    await vulnerabilityService.getById(id, context.user);
    const acceptances = await prisma.riskAcceptance.findMany({
      where: { vulnerabilityId: id },
      include: {
        acceptedBy: { select: { displayName: true } },
        approvedBy: { select: { displayName: true } },
      },
      orderBy: { acceptedDate: "desc" },
    });
    return successResponse(acceptances);
  },
  { permission: Permission.VIEW_VULNERABILITIES }
);

export const POST = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const data = await validateBody(req, createRiskAcceptanceSchema);
    const acceptance = await vulnerabilityService.createRiskAcceptance(id, data, context.user);
    return createdResponse(acceptance);
  },
  { permission: Permission.ACCEPT_RISK }
);
