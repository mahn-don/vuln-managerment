import { importService } from "@/modules/integration-engine";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const preview = await importService.getPreview(id, context.user);
    return successResponse(preview);
  },
  { permission: Permission.IMPORT_EXCEL }
);
