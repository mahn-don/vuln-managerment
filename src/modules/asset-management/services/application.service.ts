import { prisma } from "@/lib/db/prisma";
import {
  cadenceLabel,
  evaluationRecency,
  getPeriodicPolicy,
  intervalForApplication,
  periodicState,
  recencyRange,
  type EvaluationRecency,
} from "@/modules/assessment-management/services/periodic-policy.service";
import { normalizeAppName } from "@/lib/utils/normalize";
import { auditService } from "@/modules/platform-services/services/audit.service";
import { NotFoundError, ConflictError, ForbiddenError } from "@/lib/api/errors";
import {
  scopeApplicationWhere,
  type UserContext,
} from "@/modules/platform-services/middleware/abac.middleware";
import type { CreateApplicationInput, UpdateApplicationInput, ApplicationQuery } from "../schemas/application.schema";
import type { Prisma } from "@/generated/prisma";

/** Findings still needing work, matching the platform's terminal-status list. */
const OPEN_STATUS = { notIn: ["CLOSED", "FALSE_POSITIVE", "DUPLICATE", "WONT_FIX", "RISK_ACCEPTED"] };

class ApplicationService {
  async assertAccess(id: string, user: UserContext) {
    const application = await prisma.application.findFirst({
      where: scopeApplicationWhere(user, { id }),
      select: { id: true },
    });
    if (!application) throw new NotFoundError("Application", id);
  }

  async create(data: CreateApplicationInput, user: UserContext) {
    if (user.role === "SECURITY_MANAGER" && data.businessUnitId !== user.businessUnitId) {
      throw new ForbiddenError("Security managers may only create applications in their business unit");
    }

    // Check for duplicate application ID
    const existing = await prisma.application.findUnique({
      where: { applicationId: data.applicationId },
    });
    if (existing) {
      throw new ConflictError(`Application with ID '${data.applicationId}' already exists`);
    }

    const application = await prisma.application.create({
      data: {
        ...data,
        normalizedName: normalizeAppName(data.name),
        goLiveDate: data.goLiveDate ? new Date(data.goLiveDate) : undefined,
        repositoryUrl: data.repositoryUrl || undefined,
        serviceUrl: data.serviceUrl || undefined,
        productionUrl: data.productionUrl || undefined,
        createdById: user.id,
        updatedById: user.id,
      },
      include: {
        businessUnit: true,
        aliases: true,
        owners: true,
      },
    });

    await auditService.log({
      userId: user.id,
      action: "application.create",
      entityType: "application",
      entityId: application.id,
      details: { applicationId: data.applicationId, name: data.name },
    });

    return application;
  }

  async getById(id: string, user: UserContext) {
    const application = await prisma.application.findFirst({
      where: scopeApplicationWhere(user, { id }),
      include: {
        businessUnit: true,
        aliases: true,
        owners: {
          include: { user: { select: { displayName: true, email: true } } },
        },
        // Feeds the provenance line on the record header: who last changed this.
        updatedBy: { select: { displayName: true } },
      },
    });

    if (!application) {
      throw new NotFoundError("Application", id);
    }

    // Periodic standing and the go-live / periodic split of open findings: both
    // are derived, so they are computed here rather than stored and drifting.
    const policy = await getPeriodicPolicy();
    const months = intervalForApplication(application, policy);

    const openFindings = { vulnerabilityApplications: { some: { applicationId: id } }, status: OPEN_STATUS };
    const [goLiveOpen, periodicOpen] = await Promise.all([
      prisma.vulnerability.count({ where: { ...openFindings, scope: "GOLIVE" } }),
      prisma.vulnerability.count({ where: { ...openFindings, scope: "PERIODIC" } }),
    ]);

    return {
      ...application,
      periodic: {
        intervalMonths: months,
        cadence: cadenceLabel(months),
        state: periodicState(application.lastAssessmentDate, application.nextAssessmentDue, new Date()),
        recency: evaluationRecency(application.lastAssessmentDate, new Date()),
        lastAssessmentYear: application.lastAssessmentDate?.getFullYear() ?? null,
        goLiveOpen,
        periodicOpen,
      },
    };
  }

  async list(query: ApplicationQuery, user: UserContext) {
    const where: Prisma.ApplicationWhereInput = {};

    // Text search
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { applicationId: { contains: query.search, mode: "insensitive" } },
        { normalizedName: { contains: query.search.toLowerCase(), mode: "insensitive" } },
        {
          aliases: {
            some: {
              normalizedAlias: { contains: query.search.toLowerCase(), mode: "insensitive" },
            },
          },
        },
      ];
    }

    // Filters
    if (query.status) {
      const statuses = query.status.split(",");
      where.status = { in: statuses as Prisma.EnumApplicationStatusFilter["in"] };
    }

    if (query.level) {
      const levels = query.level
        .split(",")
        .map((value) => Number(value))
        .filter((value) => value === 1 || value === 2 || value === 3);
      if (levels.length > 0) where.level = { in: levels };
    }

    if (query.businessUnitId) {
      where.businessUnitId = query.businessUnitId;
    }

    if (query.internetFacing !== undefined) {
      where.internetFacing = query.internetFacing;
    }

    if (query.hasOpenVulns) {
      where.openVulnerabilityCount = { gt: 0 };
    }

    if (query.assessmentOverdue) {
      where.nextAssessmentDue = { lt: new Date() };
    }

    if (query.evaluatedIn) {
      const buckets = query.evaluatedIn.split(",") as EvaluationRecency[];
      const now = new Date();
      // NEVER is the absence of a date, so it cannot be expressed as a range;
      // combining it with dated buckets means OR-ing the two shapes together.
      const ranges = buckets
        .map((bucket) => recencyRange(bucket, now))
        .filter((range): range is { gte?: Date; lt?: Date } => range !== null)
        .map((range) => ({ lastAssessmentDate: range }));
      if (buckets.includes("NEVER")) ranges.push({ lastAssessmentDate: null } as never);

      if (ranges.length === 1) Object.assign(where, ranges[0]);
      else if (ranges.length > 1) where.OR = [...(where.OR ?? []), ...ranges];
    }

    if (query.periodicDueSoon) {
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 60);
      where.nextAssessmentDue = { gte: new Date(), lte: horizon };
    }

    if (query.neverAssessed) {
      where.lastAssessmentDate = null;
    }

    // Allowed sort fields
    const allowedSortFields = [
      "name",
      "applicationId",
      "level",
      "status",
      "createdAt",
      "updatedAt",
      "openVulnerabilityCount",
      "nextAssessmentDue",
    ];

    const sortField = query.sort && allowedSortFields.includes(query.sort) ? query.sort : "name";
    const orderBy = { [sortField]: query.order };

    const scopedWhere = scopeApplicationWhere(user, where);
    const [items, total] = await Promise.all([
      prisma.application.findMany({
        where: scopedWhere,
        include: {
          businessUnit: { select: { name: true } },
          _count: {
            select: {
              aliases: true,
              assessmentApplications: true,
            },
          },
        },
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.application.count({ where: scopedWhere }),
    ]);

    // The periodic obligation is a policy question, not a stored column: derive
    // it here so every list rendering it agrees on the answer.
    const policy = await getPeriodicPolicy();
    const now = new Date();
    const decorated = items.map((app) => {
      const months = intervalForApplication(app, policy);
      return {
        ...app,
        periodic: {
          intervalMonths: months,
          cadence: cadenceLabel(months),
          state: periodicState(app.lastAssessmentDate, app.nextAssessmentDue, now),
          recency: evaluationRecency(app.lastAssessmentDate, now),
          lastAssessmentYear: app.lastAssessmentDate?.getFullYear() ?? null,
        },
      };
    });

    return { items: decorated, total };
  }

  async update(id: string, data: UpdateApplicationInput, user: UserContext) {
    const existing = await prisma.application.findFirst({
      where: scopeApplicationWhere(user, { id }),
    });
    if (!existing) {
      throw new NotFoundError("Application", id);
    }
    if (
      user.role === "SECURITY_MANAGER" &&
      data.businessUnitId !== undefined &&
      data.businessUnitId !== user.businessUnitId
    ) {
      throw new ForbiddenError("Security managers may not move applications outside their business unit");
    }

    // Build changes diff for audit
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== (existing as Record<string, unknown>)[key]) {
        changes[key] = { old: (existing as Record<string, unknown>)[key], new: value };
      }
    }

    const updateData: Prisma.ApplicationUpdateInput = {
      ...data,
      updatedBy: { connect: { id: user.id } },
    };

    if (data.name) {
      updateData.normalizedName = normalizeAppName(data.name);
    }

    if (data.goLiveDate) {
      updateData.goLiveDate = new Date(data.goLiveDate);
    }

    // Clean empty string URLs
    if (data.repositoryUrl === "") updateData.repositoryUrl = null;
    if (data.serviceUrl === "") updateData.serviceUrl = null;
    if (data.productionUrl === "") updateData.productionUrl = null;

    const application = await prisma.application.update({
      where: { id },
      data: updateData,
      include: {
        businessUnit: true,
        aliases: true,
        owners: true,
      },
    });

    if (Object.keys(changes).length > 0) {
      await auditService.log({
        userId: user.id,
        action: "application.update",
        entityType: "application",
        entityId: id,
        details: { changes },
      });
    }

    return application;
  }

  async softDelete(id: string, user: UserContext) {
    const existing = await prisma.application.findFirst({
      where: scopeApplicationWhere(user, { id }),
    });
    if (!existing) {
      throw new NotFoundError("Application", id);
    }

    const application = await prisma.application.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        updatedBy: { connect: { id: user.id } },
      },
    });

    await auditService.log({
      userId: user.id,
      action: "application.archive",
      entityType: "application",
      entityId: id,
      details: { previousStatus: existing.status },
    });

    return application;
  }

  async getSecuritySummary(id: string, user: UserContext) {
    const app = await prisma.application.findFirst({
      where: scopeApplicationWhere(user, { id }),
      select: {
        id: true,
        name: true,
        level: true,
        internetFacing: true,
        openVulnerabilityCount: true,
        openCriticalCount: true,
        openHighCount: true,
        lastAssessmentDate: true,
        nextAssessmentDue: true,
      },
    });

    if (!app) throw new NotFoundError("Application", id);

    // Get vulnerability breakdown
    const vulnCounts = await prisma.vulnerability.groupBy({
      by: ["severity"],
      where: {
        vulnerabilityApplications: { some: { applicationId: id } },
        status: { notIn: ["CLOSED", "FALSE_POSITIVE", "DUPLICATE", "WONT_FIX"] },
      },
      _count: true,
    });

    // Get SLA breach count
    const slaBreached = await prisma.vulnerability.count({
      where: {
        vulnerabilityApplications: { some: { applicationId: id } },
        slaStatus: "BREACHED",
        status: { notIn: ["CLOSED", "FALSE_POSITIVE", "DUPLICATE", "WONT_FIX"] },
      },
    });

    // Get assessment counts
    const assessmentCounts = await prisma.assessment.groupBy({
      by: ["status"],
      where: {
        assessmentApplications: { some: { applicationId: id } },
      },
      _count: true,
    });

    const totalAssessments = await prisma.assessment.count({
      where: { assessmentApplications: { some: { applicationId: id } } },
    });

    return {
      ...app,
      vulnerabilities: {
        bySeverity: vulnCounts.reduce(
          (acc, v) => ({ ...acc, [v.severity]: v._count }),
          {} as Record<string, number>
        ),
        slaBreached,
      },
      assessments: {
        total: totalAssessments,
        byStatus: assessmentCounts.reduce(
          (acc, a) => ({ ...acc, [a.status]: a._count }),
          {} as Record<string, number>
        ),
      },
    };
  }
}

export const applicationService = new ApplicationService();
