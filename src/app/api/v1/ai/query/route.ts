import { nlqService } from "@/modules/intelligence-engine";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import { Permission } from "@/modules/platform-services/types/roles";
import { distributedRateLimit } from "@/lib/api/rate-limit";
import { z } from "zod/v4";

const MAX_DAILY_AI_QUERIES = 50;

const querySchema = z.object({
  question: z.string().min(3).max(500),
});

export const POST = createHandler(
  async (req, context) => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    const dailyLimit = await distributedRateLimit({
      key: `ai-daily:${context.user.id}:${now.toISOString().split("T")[0]}`,
      limit: MAX_DAILY_AI_QUERIES,
      windowMs: tomorrow.getTime() - now.getTime(),
    });
    if (!dailyLimit.allowed) {
      throw new ApiError(429, "RATE_LIMIT", "Daily AI query limit exceeded. Try again tomorrow.");
    }

    const { question } = await validateBody(req, querySchema);
    const result = await nlqService.ask(question, context.user.id, context.user.role);
    return successResponse(result);
  },
  { permission: Permission.USE_AI_QUERY, rateLimit: { limit: 10, windowMs: 60_000 } }
);
