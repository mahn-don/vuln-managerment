import { appResolutionService } from "@/modules/intelligence-engine/services/app-resolution.service";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { z } from "zod/v4";

const overrideSchema = z.object({
  applicationId: z.string().uuid(),
});

export const POST = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const { applicationId } = await validateBody(req, overrideSchema);
    await appResolutionService.overrideMapping(id, applicationId, context.user);
    return successResponse({ overridden: true });
  },
  { permission: Permission.CONFIRM_MAPPINGS }
);
