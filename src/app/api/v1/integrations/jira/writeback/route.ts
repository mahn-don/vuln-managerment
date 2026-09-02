import { jiraWritebackService } from "@/modules/integration-engine/services/jira-writeback.service";
import { createHandler, validateBody, successResponse, createdResponse, paginationMeta } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { z } from "zod/v4";

const queueWritebackSchema = z.object({
  externalIssueId: z.string().uuid(),
  action: z.enum(["assign", "comment", "status_change"]),
  payload: z.object({
    assign: z.object({ accountId: z.string().optional(), email: z.string().optional() }).optional(),
    comment: z.object({ body: z.string().min(1) }).optional(),
    statusChange: z.object({ targetStatus: z.string() }).optional(),
  }),
});

// GET - List pending write-back actions
export const GET = createHandler(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const { items, total } = await jiraWritebackService.getPendingActions(page, limit);
    return successResponse(items, paginationMeta(total, page, limit));
  },
  { permission: Permission.MANAGE_INTEGRATIONS }
);

// POST - Queue a new write-back action
export const POST = createHandler(
  async (req, context) => {
    const data = await validateBody(req, queueWritebackSchema);
    const entry = await jiraWritebackService.queueAction(
      data.externalIssueId,
      data.action,
      data.payload,
      context.user.id
    );
    return createdResponse(entry);
  },
  { permission: Permission.APPROVE_AI_ACTIONS }
);
