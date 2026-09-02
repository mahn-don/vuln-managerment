import { syncService } from "@/modules/integration-engine/services/sync.service";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const POST = createHandler(
  async () => {
    const result = await syncService.testConnection();
    return successResponse(result);
  },
  { permission: Permission.MANAGE_INTEGRATIONS }
);
