import {
  confluenceSettingsService,
  confluenceSettingsSchema,
} from "@/modules/integration-engine/services/confluence-settings.service";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

/** Confluence connection used to read the specifications tickets link to. */
export const GET = createHandler(
  async () => successResponse(await confluenceSettingsService.getRedacted()),
  { permission: Permission.MANAGE_INTEGRATIONS }
);

export const PUT = createHandler(
  async (req, context) => {
    const data = await validateBody(req, confluenceSettingsSchema);
    return successResponse(await confluenceSettingsService.save(data, context.user.id));
  },
  { permission: Permission.MANAGE_INTEGRATIONS, rateLimit: { limit: 20, windowMs: 60_000 } }
);
