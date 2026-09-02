import { jiraWritebackService } from "@/modules/integration-engine/services/jira-writeback.service";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { z } from "zod/v4";

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export const POST = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const { action } = await validateBody(req, actionSchema);

    if (action === "approve") {
      await jiraWritebackService.approve(id, context.user.id);
    } else {
      await jiraWritebackService.reject(id, context.user.id);
    }

    return successResponse({ [action + "d"]: true });
  },
  { permission: Permission.MANAGE_INTEGRATIONS }
);
