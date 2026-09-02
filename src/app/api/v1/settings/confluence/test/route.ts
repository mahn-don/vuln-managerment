import {
  confluenceSettingsService,
  confluenceTestSchema,
} from "@/modules/integration-engine/services/confluence-settings.service";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

/** Proves the connection with the values on the form, before they are saved. */
export const POST = createHandler(
  async (req) => {
    const override = await validateBody(req, confluenceTestSchema);
    return successResponse(await confluenceSettingsService.test(override));
  },
  { permission: Permission.MANAGE_INTEGRATIONS, rateLimit: { limit: 10, windowMs: 60_000 } }
);
