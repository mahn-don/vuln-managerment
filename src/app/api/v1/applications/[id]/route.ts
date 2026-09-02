import { NextRequest } from "next/server";
import { applicationService, updateApplicationSchema } from "@/modules/asset-management";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

// GET /api/v1/applications/:id
export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const application = await applicationService.getById(id, context.user);
    return successResponse(application);
  },
  { permission: Permission.VIEW_ALL_APPLICATIONS }
);

// PUT /api/v1/applications/:id
export const PUT = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const data = await validateBody(req, updateApplicationSchema);
    const application = await applicationService.update(id, data, context.user);
    return successResponse(application);
  },
  { permission: Permission.EDIT_APPLICATIONS }
);

// DELETE /api/v1/applications/:id (soft delete)
export const DELETE = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const application = await applicationService.softDelete(id, context.user);
    return successResponse(application);
  },
  { permission: Permission.EDIT_APPLICATIONS }
);
