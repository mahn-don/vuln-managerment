import { NextRequest } from "next/server";
import { aliasService, applicationService } from "@/modules/asset-management";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

// DELETE /api/v1/applications/:id/aliases/:aliasId
export const DELETE = createHandler(
  async (req, context) => {
    const { id, aliasId } = await context.params;
    await applicationService.assertAccess(id, context.user);
    await aliasService.removeAlias(aliasId, context.user.id, id);
    return successResponse({ deleted: true });
  },
  { permission: Permission.EDIT_APPLICATIONS }
);
