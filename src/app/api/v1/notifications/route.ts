import { notificationService } from "@/modules/operations-console";
import { createHandler, successResponse, paginationMeta } from "@/lib/api";

export const GET = createHandler(
  async (req, context) => {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const { items, total, unreadCount } = await notificationService.getForUser(
      context.user.id, page, limit, unreadOnly
    );

    return successResponse({ items, unreadCount }, paginationMeta(total, page, limit));
  }
);
