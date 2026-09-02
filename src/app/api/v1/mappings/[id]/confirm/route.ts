import { appResolutionService } from "@/modules/intelligence-engine/services/app-resolution.service";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const POST = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    await appResolutionService.confirmMapping(id, context.user);
    return successResponse({ confirmed: true });
  },
  { permission: Permission.CONFIRM_MAPPINGS }
);
