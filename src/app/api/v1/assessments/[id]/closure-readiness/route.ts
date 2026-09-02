import { assessmentService } from "@/modules/assessment-management";
import { evaluateAssessmentClosure } from "@/modules/assessment-management/services/closure-policy.service";
import { createHandler, successResponse } from "@/lib/api";
import { NotFoundError } from "@/lib/api/errors";
import { Permission } from "@/modules/platform-services/types/roles";

/**
 * What this ticket is still missing before it can be closed.
 *
 * Read by the assessment record so the tester sees the gap while there is still
 * time to fill it, rather than discovering it when the close is refused.
 */
export const GET = createHandler(
  async (_req, context) => {
    const { id } = await context.params;
    // Scope check: the service throws if the user cannot see this assessment.
    await assessmentService.getById(id, context.user);

    const readiness = await evaluateAssessmentClosure(id);
    if (!readiness) throw new NotFoundError("Assessment", id);
    return successResponse(readiness);
  },
  { permission: Permission.VIEW_ASSESSMENTS }
);
