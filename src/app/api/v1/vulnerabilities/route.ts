import { vulnerabilityService, vulnerabilityQuerySchema, createVulnerabilitySchema } from "@/modules/vulnerability-management";
import { createHandler, validateBody, successResponse, createdResponse, paginationMeta } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (req, context) => {
    const { searchParams } = new URL(req.url);
    const params = Object.fromEntries(searchParams.entries());
    const query = vulnerabilityQuerySchema.parse(params);
    const { items, total } = await vulnerabilityService.list(query, context.user);
    return successResponse(items, paginationMeta(total, query.page, query.limit));
  },
  { permission: Permission.VIEW_VULNERABILITIES }
);

export const POST = createHandler(
  async (req, context) => {
    const data = await validateBody(req, createVulnerabilitySchema);
    const vuln = await vulnerabilityService.create(data, context.user);
    return createdResponse(vuln);
  },
  { permission: Permission.UPDATE_VULNERABILITY_STATUS }
);
