import { analyticsService } from "@/modules/operations-console/services/analytics.service";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (req, context) => {
    const { searchParams } = new URL(req.url);
    const months = Math.min(24, Math.max(1, parseInt(searchParams.get("months") || "12")));
    const data = await analyticsService.getFullAnalytics(context.user, months);
    return successResponse(data);
  },
  { permission: Permission.VIEW_DASHBOARDS }
);
