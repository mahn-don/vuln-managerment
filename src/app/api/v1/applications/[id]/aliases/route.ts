import { NextRequest } from "next/server";
import { aliasService, applicationService, createAliasSchema } from "@/modules/asset-management";
import { createHandler, validateBody, successResponse, createdResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

// GET /api/v1/applications/:id/aliases
export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    await applicationService.assertAccess(id, context.user);
    const aliases = await aliasService.getAliases(id);
    return successResponse(aliases);
  },
  { permission: Permission.VIEW_ALL_APPLICATIONS }
);

// POST /api/v1/applications/:id/aliases
export const POST = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    await applicationService.assertAccess(id, context.user);
    const data = await validateBody(req, createAliasSchema);
    const result = await aliasService.addAlias(id, data, context.user.id);
    return createdResponse(result);
  },
  { permission: Permission.EDIT_APPLICATIONS }
);
