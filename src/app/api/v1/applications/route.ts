import { NextRequest } from "next/server";
import { applicationService, applicationQuerySchema, createApplicationSchema } from "@/modules/asset-management";
import { createHandler, validateBody, successResponse, createdResponse, paginationMeta } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

// GET /api/v1/applications - List applications
export const GET = createHandler(
  async (req, context) => {
    const { searchParams } = new URL(req.url);
    const params = Object.fromEntries(searchParams.entries());
    const query = applicationQuerySchema.parse(params);

    const { items, total } = await applicationService.list(query, context.user);

    return successResponse(items, paginationMeta(total, query.page, query.limit));
  },
  { permission: Permission.VIEW_ALL_APPLICATIONS }
);

// POST /api/v1/applications - Create application
export const POST = createHandler(
  async (req, context) => {
    const data = await validateBody(req, createApplicationSchema);
    const application = await applicationService.create(data, context.user);
    return createdResponse(application);
  },
  { permission: Permission.EDIT_APPLICATIONS, auditAction: "application.create" }
);
