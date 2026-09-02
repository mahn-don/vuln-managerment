import { assessmentService } from "@/modules/assessment-management";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const history = await assessmentService.getStatusHistory(id, context.user);
    return successResponse(history);
  },
  { permission: Permission.VIEW_ASSESSMENTS }
);
