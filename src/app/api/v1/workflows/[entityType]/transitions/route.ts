import { workflowService } from "@/modules/platform-services";
import { createHandler, successResponse } from "@/lib/api";
import { ValidationError } from "@/lib/api/errors";

/**
 * The status changes allowed from where a record currently stands.
 *
 * Without this the status picker had to offer the whole vocabulary, and any
 * move the workflow forbids came back as a failure after the fact. Offering
 * only reachable statuses is the difference between a control and a guess.
 */
export const GET = createHandler(async (req, context) => {
  const { entityType } = await context.params;
  const from = new URL(req.url).searchParams.get("from");
  if (!from) throw new ValidationError("A 'from' status is required");

  const transitions = await workflowService.getAllowedTransitions(entityType, from, context.user.role);
  return successResponse(transitions);
});
