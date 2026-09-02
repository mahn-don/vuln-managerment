import { appResolutionService } from "@/modules/intelligence-engine/services/app-resolution.service";
import { ticketTriageService } from "@/modules/intelligence-engine/services/ticket-triage.service";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

/**
 * Re-run triage for one ticket in the review queue.
 *
 * Worth having on the queue itself: a reviewer who has just added an alias or
 * imported the missing application wants the suggestion recomputed there and
 * then, rather than waiting for the next sweep.
 */
export const POST = createHandler(
  async (_req, context) => {
    const { id } = await context.params;

    const externalIssueId = await appResolutionService.assertMappingAccess(id, context.user);
    const triage = await ticketTriageService.triageIssue(externalIssueId);
    return successResponse(triage);
  },
  { permission: Permission.CONFIRM_MAPPINGS, rateLimit: { limit: 20, windowMs: 60_000 } }
);
