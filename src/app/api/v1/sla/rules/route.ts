import { prisma } from "@/lib/db/prisma";
import { createHandler, successResponse, createdResponse, validateBody } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { z } from "zod/v4";

const createSLARuleSchema = z.object({
  name: z.string().min(1).max(100),
  entityType: z.enum(["ASSESSMENT", "VULNERABILITY"]),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"]).optional(),
  /** Applies to applications at this level (1-3); omit to match any level. */
  appLevel: z.coerce.number().int().min(1).max(3).optional(),
  internetFacing: z.boolean().optional(),
  businessUnitId: z.string().uuid().optional(),
  environment: z.string().max(50).optional(),
  complianceScope: z.string().max(50).optional(),
  slaDays: z.number().int().positive(),
  warningDaysBefore: z.number().int().positive().default(3),
  priority: z.number().int().default(0),
  effectiveFrom: z.string().date(),
});

export const GET = createHandler(
  async () => {
    const rules = await prisma.sLARule.findMany({
      where: { isActive: true },
      include: { businessUnit: { select: { name: true } } },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    });
    return successResponse(rules);
  },
  { permission: Permission.VIEW_DASHBOARDS }
);

export const POST = createHandler(
  async (req, context) => {
    const data = await validateBody(req, createSLARuleSchema);
    const rule = await prisma.sLARule.create({
      data: {
        ...data,
        effectiveFrom: new Date(data.effectiveFrom),
        createdById: context.user.id,
      },
    });
    return createdResponse(rule);
  },
  { permission: Permission.CONFIGURE_SLA }
);
