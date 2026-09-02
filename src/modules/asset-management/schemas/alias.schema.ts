import { z } from "zod/v4";

export const createAliasSchema = z.object({
  alias: z.string().min(1).max(255),
  source: z.enum(["MANUAL", "IMPORT", "AI_LEARNED", "JIRA_COMPONENT"]).default("MANUAL"),
});

export type CreateAliasInput = z.infer<typeof createAliasSchema>;
