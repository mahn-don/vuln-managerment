import { vulnerabilityService, updateVulnerabilityStatusSchema } from "@/modules/vulnerability-management";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const PATCH = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const data = await validateBody(req, updateVulnerabilityStatusSchema);
    const vuln = await vulnerabilityService.updateStatus(id, data, context.user);
    return successResponse(vuln);
  },
  { permission: Permission.UPDATE_VULNERABILITY_STATUS }
);
