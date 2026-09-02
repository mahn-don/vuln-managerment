import { vulnerabilityService } from "@/modules/vulnerability-management";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const history = await vulnerabilityService.getStatusHistory(id, context.user);
    return successResponse(history);
  },
  { permission: Permission.VIEW_VULNERABILITIES }
);
