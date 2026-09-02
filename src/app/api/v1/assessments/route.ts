import { assessmentService, assessmentQuerySchema, createAssessmentSchema } from "@/modules/assessment-management";
import { createHandler, validateBody, successResponse, createdResponse, paginationMeta } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (req, context) => {
    const { searchParams } = new URL(req.url);
    const params = Object.fromEntries(searchParams.entries());
    const query = assessmentQuerySchema.parse(params);
    const { items, total } = await assessmentService.list(query, context.user);
    return successResponse(items, paginationMeta(total, query.page, query.limit));
  },
  { permission: Permission.VIEW_ASSESSMENTS }
);

export const POST = createHandler(
  async (req, context) => {
    const data = await validateBody(req, createAssessmentSchema);
    const assessment = await assessmentService.create(data, context.user);
    return createdResponse(assessment);
  },
  { permission: Permission.UPDATE_ASSESSMENT_STATUS }
);
