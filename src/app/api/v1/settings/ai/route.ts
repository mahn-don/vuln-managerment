import {
  aiSettingsService,
  aiSettingsSchema,
} from "@/modules/platform-services/services/ai-settings.service";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

/**
 * AI provider configuration.
 *
 * The stored token is never returned — the screen receives only whether one is
 * set and a masked hint — so reading this endpoint cannot disclose a credential.
 */
export const GET = createHandler(
  async () => successResponse(await aiSettingsService.getRedacted()),
  { permission: Permission.CONFIGURE_SYSTEM }
);

export const PUT = createHandler(
  async (req, context) => {
    const data = await validateBody(req, aiSettingsSchema);
    return successResponse(await aiSettingsService.save(data, context.user.id));
  },
  { permission: Permission.CONFIGURE_SYSTEM, rateLimit: { limit: 20, windowMs: 60_000 } }
);
