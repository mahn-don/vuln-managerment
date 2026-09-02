import { prisma } from "@/lib/db/prisma";
import { auditService } from "@/modules/platform-services/services/audit.service";
import { workflowService } from "@/modules/platform-services/services/workflow.service";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { AssessmentStatus } from "@/types/enums";
import { refreshPeriodicCycle } from "./periodic-policy.service";
import { evaluateAssessmentClosure } from "./closure-policy.service";
import {
  scopeApplicationWhere,
  scopeAssessmentWhere,
  type UserContext,
} from "@/modules/platform-services/middleware/abac.middleware";
import type { Prisma } from "@/generated/prisma";
import type {
  CreateAssessmentInput,
  UpdateAssessmentInput,
  UpdateAssessmentStatusInput,
  AssignAssessmentInput,
  AssessmentQuery,
} from "../schemas/assessment.schema";

async function generateInternalKey(): Promise<string> {
  const result = await prisma.$queryRaw<{ next: bigint }[]>`
    SELECT nextval('assessment_internal_key_seq') AS next
  `;
  return `ASM-${String(result[0]?.next ?? "1").padStart(5, "0")}`;
}

/**
 * Scope is chosen by the requester, but the two legacy assessment types already
 * mean one specific scope, so a ticket of that type is never left unclassified.
 * Everything else (a penetration test above all) must be told which it is.
 */
async function defaultScopeForType(assessmentTypeId: string) {
  const type = await prisma.assessmentType.findUnique({
    where: { id: assessmentTypeId },
    select: { code: true },
  });
  if (type?.code === "GOLIVE") return "GOLIVE" as const;
  if (type?.code === "PERIODIC") return "PERIODIC" as const;
  return undefined;
}

class AssessmentService {
  async create(data: CreateAssessmentInput, user: UserContext) {
    const applicationIds = [...new Set(data.applicationIds)];
    const visibleApplicationCount = await prisma.application.count({
      where: scopeApplicationWhere(user, { id: { in: applicationIds } }),
    });
    if (visibleApplicationCount !== applicationIds.length) {
      throw new NotFoundError("Application");
    }

    const internalKey = await generateInternalKey();

    const assessment = await prisma.assessment.create({
      data: {
        internalKey,
        title: data.title,
        description: data.description,
        assessmentTypeId: data.assessmentTypeId,
        scope: data.scope ?? (await defaultScopeForType(data.assessmentTypeId)),
        status: data.status || AssessmentStatus.REQUESTED,
        priority: data.priority,
        requesterId: data.requesterId || user.id,
        assigneeId: data.assigneeId,
        createdDate: new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        assessmentApplications: {
          create: data.applicationIds.map((appId, i) => ({
            applicationId: appId,
            isPrimary: i === 0,
            mappedBy: "manual",
          })),
        },
      },
      include: {
        assessmentType: true,
        requester: { select: { displayName: true, email: true } },
        assignee: { select: { displayName: true, email: true } },
        assessmentApplications: {
          include: { application: { select: { id: true, name: true, applicationId: true } } },
        },
      },
    });

    // Record initial status
    await prisma.statusHistory.create({
      data: {
        entityType: "ASSESSMENT",
        entityId: assessment.id,
        fromStatus: null,
        toStatus: assessment.status,
        changedById: user.id,
        changedAt: new Date(),
        source: "MANUAL",
      },
    });

    await auditService.log({
      userId: user.id,
      action: "assessment.create",
      entityType: "assessment",
      entityId: assessment.id,
      details: { internalKey, title: data.title },
    });

    return assessment;
  }

  async getById(id: string, user: UserContext) {
    const assessment = await prisma.assessment.findFirst({
      where: scopeAssessmentWhere(user, { id }),
      include: {
        assessmentType: true,
        requester: { select: { id: true, displayName: true, email: true } },
        assignee: { select: { id: true, displayName: true, email: true } },
        externalIssue: { select: { sourceId: true, source: true, status: true } },
        assessmentApplications: {
          include: {
            application: {
              select: { id: true, name: true, applicationId: true, level: true },
            },
          },
        },
        vulnerabilities: {
          select: { id: true, internalKey: true, title: true, severity: true, status: true },
          orderBy: { severity: "asc" },
        },
      },
    });

    if (!assessment) throw new NotFoundError("Assessment", id);
    return assessment;
  }

  async list(query: AssessmentQuery, user: UserContext) {
    const where: Prisma.AssessmentWhereInput = {};

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { internalKey: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (query.status) {
      const statuses = query.status.split(",");
      where.status = { in: statuses };
    }

    if (query.assessmentTypeId) where.assessmentTypeId = query.assessmentTypeId;
    if (query.scope) {
      where.scope = { in: query.scope.split(",") as ("GOLIVE" | "PERIODIC")[] };
    }
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.priority) {
      const priorities = query.priority.split(",");
      where.priority = { in: priorities as ("CRITICAL" | "HIGH" | "MEDIUM" | "LOW")[] };
    }
    if (query.slaStatus) {
      where.slaStatus = query.slaStatus as "ON_TRACK" | "AT_RISK" | "BREACHED" | "PAUSED" | "EXEMPT" | "MET" | "MISSED";
    }
    if (query.overdue) {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: [AssessmentStatus.DONE, AssessmentStatus.CANCELLED] };
    }
    if (query.applicationId) {
      where.assessmentApplications = { some: { applicationId: query.applicationId } };
    }

    const allowedSorts = ["createdDate", "dueDate", "title", "status", "priority", "internalKey"];
    const sortField = query.sort && allowedSorts.includes(query.sort) ? query.sort : "createdDate";

    const scopedWhere = scopeAssessmentWhere(user, where);
    const [items, total] = await Promise.all([
      prisma.assessment.findMany({
        where: scopedWhere,
        include: {
          assessmentType: { select: { name: true, code: true } },
          assignee: { select: { displayName: true } },
          assessmentApplications: {
            where: { isPrimary: true },
            include: { application: { select: { name: true, applicationId: true } } },
            take: 1,
          },
          _count: { select: { vulnerabilities: true } },
        },
        orderBy: { [sortField]: query.order },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.assessment.count({ where: scopedWhere }),
    ]);

    return { items, total };
  }

  async updateStatus(id: string, data: UpdateAssessmentStatusInput, user: UserContext) {
    const assessment = await prisma.assessment.findFirst({
      where: scopeAssessmentWhere(user, { id }),
    });
    if (!assessment) throw new NotFoundError("Assessment", id);

    const isValid = await workflowService.validateTransition("assessment", assessment.status, data.status);
    if (!isValid) {
      const allowed = await workflowService.getAllowedTransitions("assessment", assessment.status);
      // A refused transition is a 400 with the reachable statuses, not a 500.
      throw new ValidationError(
        `Cannot transition from '${assessment.status}' to '${data.status}'. Allowed: ${allowed.map((t) => t.toStatus).join(", ") || "none (terminal state)"}`
      );
    }

    const updateData: Prisma.AssessmentUpdateInput = { status: data.status };

    // Track lifecycle timestamps
    if (data.status === AssessmentStatus.IN_PROGRESS && !assessment.startedDate) {
      updateData.startedDate = new Date();
    }
    const completedAt = data.status === AssessmentStatus.DONE ? new Date() : null;
    if (completedAt) {
      // The ticket is the evidence the work happened, so it has to carry what
      // the security team said it must before it can be closed.
      const readiness = await evaluateAssessmentClosure(id);
      if (readiness && readiness.blocking.length > 0) {
        throw new ValidationError(
          `This ticket cannot be closed yet — missing: ${readiness.blocking.join(", ")}.`
        );
      }
      updateData.completedDate = completedAt;
    }

    const updated = await prisma.assessment.update({
      where: { id },
      data: updateData,
    });

    await prisma.statusHistory.create({
      data: {
        entityType: "ASSESSMENT",
        entityId: id,
        fromStatus: assessment.status,
        toStatus: data.status,
        changedById: user.id,
        changedAt: new Date(),
        reason: data.reason,
        source: "MANUAL",
      },
    });

    // Completing a PERIODIC assessment is what proves the whole application was
    // examined, so it is the only thing that advances the periodic clock. Until
    // now nothing wrote lastAssessmentDate at all, so every cadence figure the
    // UI showed was whatever the import had seeded.
    if (completedAt) {
      await refreshPeriodicCycle(id, completedAt);
    }

    await auditService.log({
      userId: user.id,
      action: "assessment.status_change",
      entityType: "assessment",
      entityId: id,
      details: { from: assessment.status, to: data.status, reason: data.reason },
    });

    return updated;
  }

  async assign(id: string, data: AssignAssessmentInput, user: UserContext) {
    const assessment = await prisma.assessment.findFirst({
      where: scopeAssessmentWhere(user, { id }),
    });
    if (!assessment) throw new NotFoundError("Assessment", id);

    const previousAssignee = assessment.assigneeId;

    const updated = await prisma.assessment.update({
      where: { id },
      data: {
        assigneeId: data.assigneeId,
        status: assessment.status === AssessmentStatus.QUEUED ? AssessmentStatus.ASSIGNED : undefined,
      },
      include: {
        assignee: { select: { displayName: true, email: true } },
      },
    });

    if (assessment.status === AssessmentStatus.QUEUED) {
      await prisma.statusHistory.create({
        data: {
          entityType: "ASSESSMENT",
          entityId: id,
          fromStatus: AssessmentStatus.QUEUED,
          toStatus: AssessmentStatus.ASSIGNED,
          changedById: user.id,
          changedAt: new Date(),
          reason: data.reason || "Assigned to engineer",
          source: "MANUAL",
        },
      });
    }

    await auditService.log({
      userId: user.id,
      action: "assessment.assign",
      entityType: "assessment",
      entityId: id,
      details: { previousAssignee, newAssignee: data.assigneeId, reason: data.reason },
    });

    return updated;
  }

  async update(id: string, data: UpdateAssessmentInput, user: UserContext) {
    const existing = await prisma.assessment.findFirst({
      where: scopeAssessmentWhere(user, { id }),
    });
    if (!existing) throw new NotFoundError("Assessment", id);

    const updated = await prisma.assessment.update({
      where: { id },
      data: {
        ...data,
        dueDate: data.dueDate === null ? null : data.dueDate ? new Date(data.dueDate) : undefined,
        assigneeId: data.assigneeId === null ? null : data.assigneeId,
      },
      include: {
        assessmentType: true,
        assignee: { select: { displayName: true, email: true } },
      },
    });

    await auditService.log({
      userId: user.id,
      action: "assessment.update",
      entityType: "assessment",
      entityId: id,
    });

    return updated;
  }

  async getStatusHistory(id: string, user: UserContext) {
    const assessment = await prisma.assessment.findFirst({
      where: scopeAssessmentWhere(user, { id }),
      select: { id: true },
    });
    if (!assessment) throw new NotFoundError("Assessment", id);

    return prisma.statusHistory.findMany({
      where: { entityType: "ASSESSMENT", entityId: id },
      include: { changedBy: { select: { displayName: true } } },
      orderBy: { changedAt: "desc" },
      take: 100,
    });
  }

  async getTypes() {
    return prisma.assessmentType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }
}

export const assessmentService = new AssessmentService();
