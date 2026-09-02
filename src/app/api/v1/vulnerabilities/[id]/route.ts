import { vulnerabilityService, updateVulnerabilitySchema } from "@/modules/vulnerability-management";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const vuln = await vulnerabilityService.getById(id, context.user);
    return successResponse(vuln);
  },
  { permission: Permission.VIEW_VULNERABILITIES }
);

export const PUT = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const data = await validateBody(req, updateVulnerabilitySchema);
    const vuln = await vulnerabilityService.update(id, data, context.user);
    return successResponse(vuln);
  },
  { permission: Permission.UPDATE_VULNERABILITY_STATUS }
);
