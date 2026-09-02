import { NextRequest } from "next/server";
import { applicationService } from "@/modules/asset-management";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

// GET /api/v1/applications/:id/security-summary
export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const summary = await applicationService.getSecuritySummary(id, context.user);
    return successResponse(summary);
  },
  { permission: Permission.VIEW_ALL_APPLICATIONS }
);
