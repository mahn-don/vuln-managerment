import { searchService } from "@/modules/operations-console";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import {
  getApplicationScopeFilter,
  getVulnerabilityScopeFilter,
  getAssessmentScopeFilter,
} from "@/modules/platform-services/middleware/abac.middleware";
import type { UserRole } from "@/types/enums";

export const GET = createHandler(
  async (req, context) => {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const userCtx = {
      id: context.user.id,
      role: context.user.role as UserRole,
      businessUnitId: context.user.businessUnitId,
    };
    const scopeFilters = {
      application: getApplicationScopeFilter(userCtx),
      vulnerability: getVulnerabilityScopeFilter(userCtx),
      assessment: getAssessmentScopeFilter(userCtx),
    };

    const results = await searchService.globalSearch(q, limit, scopeFilters);
    return successResponse(results);
  },
  { permission: Permission.VIEW_DASHBOARDS }
);
