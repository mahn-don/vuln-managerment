import { ticketAnalyzer } from "@/modules/intelligence-engine";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { z } from "zod/v4";

const analyzeSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).optional(),
  labels: z.array(z.string().max(100)).max(50).default([]),
  components: z.array(z.string().max(100)).max(50).default([]),
  reporterEmail: z.string().email().max(255).optional(),
  priority: z.string().max(50).optional(),
}).strict();

export const POST = createHandler(
  async (req) => {
    const data = await validateBody(req, analyzeSchema);
    const analysis = await ticketAnalyzer.analyze(data);
    return successResponse(analysis);
  },
  { permission: Permission.USE_AI_QUERY, rateLimit: { limit: 10, windowMs: 60_000 } }
);
