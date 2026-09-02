import { aiSettingsService, aiSettingsTestSchema } from "@/modules/platform-services/services/ai-settings.service";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

/**
 * Send one minimal request to the configured provider and report what happened.
 *
 * Accepts the values currently on the form so a configuration can be proven
 * before it is saved — including a token that has been typed but not committed.
 * Rate limited because each call costs a request against the provider.
 */
export const POST = createHandler(
  async (req) => {
    const override = await validateBody(req, aiSettingsTestSchema);
    return successResponse(await aiSettingsService.test(override));
  },
  { permission: Permission.CONFIGURE_SYSTEM, rateLimit: { limit: 10, windowMs: 60_000 } }
);
