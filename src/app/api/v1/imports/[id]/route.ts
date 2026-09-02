import { importService } from "@/modules/integration-engine";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const importRecord = await importService.getPreview(id, context.user);
    return successResponse(importRecord);
  },
  { permission: Permission.IMPORT_EXCEL }
);
