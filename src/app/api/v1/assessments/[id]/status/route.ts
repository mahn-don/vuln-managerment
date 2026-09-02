import { assessmentService, updateAssessmentStatusSchema } from "@/modules/assessment-management";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const PATCH = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const data = await validateBody(req, updateAssessmentStatusSchema);
    const assessment = await assessmentService.updateStatus(id, data, context.user);
    return successResponse(assessment);
  },
  { permission: Permission.UPDATE_ASSESSMENT_STATUS }
);
