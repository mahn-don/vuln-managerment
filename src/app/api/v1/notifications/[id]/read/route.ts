import { notificationService } from "@/modules/operations-console";
import { createHandler, successResponse } from "@/lib/api";

export const PATCH = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    await notificationService.markAsRead(id, context.user.id);
    return successResponse({ success: true });
  }
);
