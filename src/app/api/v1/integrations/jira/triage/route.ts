import { ticketTriageService } from "@/modules/intelligence-engine/services/ticket-triage.service";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { z } from "zod/v4";

const triageRequestSchema = z
  .object({
    batchSize: z.number().int().min(1).max(200).default(25),
  })
  .strict();

/** How many synced tickets are still waiting on analysis. */
export const GET = createHandler(
  async () => successResponse({ pending: await ticketTriageService.pendingCount() }),
  { permission: Permission.MANAGE_INTEGRATIONS }
);

/**
 * Drain part of the triage backlog now.
 *
 * The worker does this on a schedule; this route exists so an operator can run
 * a pass without the worker fleet, and so a failed batch can be retried on
 * demand. It is bounded by batchSize because each ticket costs one AI call.
 */
export const POST = createHandler(
  async (req) => {
    const { batchSize } = await validateBody(req, triageRequestSchema);
    const result = await ticketTriageService.triagePending(batchSize);
    return successResponse(result);
  },
  { permission: Permission.MANAGE_INTEGRATIONS, rateLimit: { limit: 5, windowMs: 60_000 } }
);
