import { assessmentService, assignAssessmentSchema } from "@/modules/assessment-management";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const PATCH = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const data = await validateBody(req, assignAssessmentSchema);
    const assessment = await assessmentService.assign(id, data, context.user);
    return successResponse(assessment);
  },
  { permission: Permission.ASSIGN_ASSESSMENTS }
);
