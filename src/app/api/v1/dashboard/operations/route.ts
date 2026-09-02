import { dashboardService } from "@/modules/operations-console";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { parseRangeParams } from "@/lib/api/range";

export const GET = createHandler(
  async (req, context) => {
    const { searchParams } = new URL(req.url);
    const data = await dashboardService.getOperationsDashboard(context.user, parseRangeParams(searchParams));
    return successResponse(data);
  },
  { permission: Permission.VIEW_DASHBOARDS }
);
