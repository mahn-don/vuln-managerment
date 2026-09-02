import { appResolutionService } from "@/modules/intelligence-engine/services/app-resolution.service";
import { createHandler, successResponse, paginationMeta } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (req, context) => {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));

    const { items, total } = await appResolutionService.getReviewQueue(page, limit, context.user);
    return successResponse(items, paginationMeta(total, page, limit));
  },
  { permission: Permission.CONFIRM_MAPPINGS }
);
