import { z } from "zod/v4";
import { AssessmentStatus } from "@/types/enums";

/** Workflow vocabulary, enforced on write. See the vulnerability schema. */
export const ASSESSMENT_STATUSES = Object.values(AssessmentStatus) as [string, ...string[]];
const statusField = z.enum(ASSESSMENT_STATUSES);

/** Go-live covers only what changed; periodic covers the whole application. */
const scopeField = z.enum(["GOLIVE", "PERIODIC"]);

export const createAssessmentSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  assessmentTypeId: z.string().uuid(),
  scope: scopeField.optional(),
  status: statusField.default("REQUESTED"),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  requesterId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().date().optional(),
  applicationIds: z.array(z.string().uuid()).min(1, "At least one application is required"),
});

export const updateAssessmentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  scope: scopeField.nullable().optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
  complexity: z.string().max(50).optional(),
});

export const updateAssessmentStatusSchema = z.object({
  status: statusField,
  reason: z.string().max(2000).optional(),
});

export const assignAssessmentSchema = z.object({
  assigneeId: z.string().uuid(),
  reason: z.string().max(2000).optional(),
});

export const assessmentQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().optional(),
  status: z.string().optional(),
  scope: z.string().optional(),
  assessmentTypeId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  priority: z.string().optional(),
  slaStatus: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;
export type UpdateAssessmentStatusInput = z.infer<typeof updateAssessmentStatusSchema>;
export type AssignAssessmentInput = z.infer<typeof assignAssessmentSchema>;
export type AssessmentQuery = z.infer<typeof assessmentQuerySchema>;
