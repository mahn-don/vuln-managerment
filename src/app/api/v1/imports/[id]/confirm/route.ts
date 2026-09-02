import { importService } from "@/modules/integration-engine";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const POST = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const result = await importService.confirmImport(id, context.user);
    return successResponse(result);
  },
  { permission: Permission.IMPORT_EXCEL }
);
