import { workflowService } from "@/modules/platform-services";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

// GET /api/v1/workflows/:entityType - Get workflow configuration
export const GET = createHandler(
  async (req, context) => {
    const { entityType } = await context.params;
    const workflow = await workflowService.getWorkflow(entityType);
    return successResponse(workflow);
  },
  { permission: Permission.VIEW_DASHBOARDS }
);
