import { notificationService } from "@/modules/operations-console";
import { createHandler, successResponse } from "@/lib/api";

export const POST = createHandler(
  async (req, context) => {
    await notificationService.markAllAsRead(context.user.id);
    return successResponse({ success: true });
  }
);
