import { z } from "zod/v4";

export const createApplicationSchema = z.object({
  applicationId: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  businessUnitId: z.string().uuid().optional(),
  department: z.string().max(100).optional(),
  /** Business importance, 1 (highest) to 3. */
  level: z.coerce.number().int().min(1).max(3).default(2),
  internetFacing: z.boolean().default(false),
  dataClassification: z.string().max(50).optional(),
  complianceScope: z.array(z.string()).default([]),
  technologyStack: z.array(z.string()).default([]),
  repositoryUrl: z.string().url().max(500).optional().or(z.literal("")),
  serviceUrl: z.string().url().max(500).optional().or(z.literal("")),
  productionUrl: z.string().url().max(500).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "DECOMMISSIONED", "PLANNING", "ARCHIVED"]).default("ACTIVE"),
  riskRating: z.string().max(50).optional(),
  goLiveDate: z.string().date().optional(),
});

export const updateApplicationSchema = createApplicationSchema.partial().omit({
  applicationId: true, // Cannot change the application ID
});

export const applicationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().optional(),
  status: z.string().optional(), // comma-separated
  level: z.string().optional(), // comma-separated 1,2,3
  businessUnitId: z.string().uuid().optional(),
  internetFacing: z.coerce.boolean().optional(),
  hasOpenVulns: z.coerce.boolean().optional(),
  assessmentOverdue: z.coerce.boolean().optional(),
  /** Periodic assessment falls due within the next 60 days. */
  periodicDueSoon: z.coerce.boolean().optional(),
  /** Calendar-year recency of the last full assessment: THIS_YEAR, LAST_YEAR, TWO_YEARS_AGO, OLDER, NEVER. */
  evaluatedIn: z.string().optional(),
  neverAssessed: z.coerce.boolean().optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type ApplicationQuery = z.infer<typeof applicationQuerySchema>;
