import { syncService } from "@/modules/integration-engine/services/sync.service";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { z } from "zod/v4";

const syncRequestSchema = z.object({
  syncType: z.enum(["ASSESSMENT", "VULNERABILITY", "FULL"]).default("FULL"),
});

export const POST = createHandler(
  async (req, context) => {
    const { syncType } = await validateBody(req, syncRequestSchema);
    const result = await syncService.runSync(syncType, "MANUAL", context.user.id);
    return successResponse(result);
  },
  { permission: Permission.MANAGE_INTEGRATIONS }
);
