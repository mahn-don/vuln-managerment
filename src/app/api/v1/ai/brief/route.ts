import { dailyBriefService } from "@/modules/intelligence-engine";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (_req, context) => {
    const brief = await dailyBriefService.generate(context.user);
    return successResponse(brief);
  },
  { permission: Permission.VIEW_DASHBOARDS, rateLimit: { limit: 5, windowMs: 60_000 } }
);
