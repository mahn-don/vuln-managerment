import { assessmentService, updateAssessmentSchema } from "@/modules/assessment-management";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const assessment = await assessmentService.getById(id, context.user);
    return successResponse(assessment);
  },
  { permission: Permission.VIEW_ASSESSMENTS }
);

export const PUT = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const data = await validateBody(req, updateAssessmentSchema);
    const assessment = await assessmentService.update(id, data, context.user);
    return successResponse(assessment);
  },
  { permission: Permission.UPDATE_ASSESSMENT_STATUS }
);
