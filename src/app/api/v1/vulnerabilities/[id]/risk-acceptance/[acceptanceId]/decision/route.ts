import { vulnerabilityService } from "@/modules/vulnerability-management";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { z } from "zod/v4";

const decisionSchema = z.object({
  approve: z.boolean(),
  reason: z.string().max(2000).optional(),
});

/**
 * Approve or reject a pending risk acceptance.
 *
 * Requires the same permission as requesting one, but the service refuses a
 * decision from the person who requested it — the separation is the control.
 */
export const POST = createHandler(
  async (req, context) => {
    const { acceptanceId } = await context.params;
    const decision = await validateBody(req, decisionSchema);
    const result = await vulnerabilityService.decideRiskAcceptance(acceptanceId, decision, context.user);
    return successResponse(result);
  },
  { permission: Permission.ACCEPT_RISK }
);
