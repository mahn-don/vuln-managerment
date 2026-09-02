import { assignmentRecommender } from "@/modules/intelligence-engine/services/assignment-recommender.service";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const POST = createHandler(
  async (req, context) => {
    const { assessmentId } = await context.params;
    const recommendation = await assignmentRecommender.recommend(assessmentId, context.user);
    return successResponse(recommendation);
  },
  { permission: Permission.ASSIGN_ASSESSMENTS }
);
