import {
  closurePolicySchema,
  getClosurePolicy,
  saveClosurePolicy,
  CLOSURE_CHECKS,
} from "@/modules/assessment-management/services/closure-policy.service";
import { prisma } from "@/lib/db/prisma";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

/**
 * The information a ticket must contain before it can be closed.
 *
 * Returns the assessment types alongside the rules so the editor can offer real
 * type codes rather than asking someone to type them correctly.
 */
export const GET = createHandler(
  async () => {
    const [policy, types] = await Promise.all([
      getClosurePolicy(),
      prisma.assessmentType.findMany({
        where: { isActive: true },
        select: { code: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return successResponse({ ...policy, availableChecks: CLOSURE_CHECKS, assessmentTypes: types });
  },
  { permission: Permission.CONFIGURE_SYSTEM }
);

export const PUT = createHandler(
  async (req, context) => {
    const policy = await validateBody(req, closurePolicySchema);
    return successResponse(await saveClosurePolicy(policy, context.user.id));
  },
  { permission: Permission.CONFIGURE_SYSTEM, rateLimit: { limit: 20, windowMs: 60_000 } }
);
