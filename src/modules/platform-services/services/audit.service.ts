import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma";
import type { AuditSource } from "@/types/enums";
import { createChildLogger } from "@/lib/logger";

const logger = createChildLogger("audit");

/**
 * Actions whose audit record is part of the control itself. If one of these
 * cannot be written, the action must not be reported as having succeeded — an
 * accepted risk or a credential change with no trace is worse than a failure.
 */
const MUST_BE_RECORDED = [
  "risk_acceptance",
  "settings.",
  "user.",
  "role",
  "mapping.confirm",
  "mapping.override",
];

interface AuditLogEntry {
  userId?: string;
  action: string;
  entityType?: string;
  /** Must be a uuid — the column is typed, and a key here silently fails the write. */
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  source?: string;
  aiMetadata?: Record<string, unknown>;
}

class AuditService {
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          details: (entry.details as Prisma.InputJsonValue) ?? undefined,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          source: (entry.source as AuditSource) || "API",
          aiMetadata: (entry.aiMetadata as Prisma.InputJsonValue) ?? undefined,
        },
      });
    } catch (error) {
      // A swallowed audit failure is invisible by construction: the action
      // succeeds, nothing is recorded, and nobody finds out until an audit asks
      // for the trail. Log it loudly, and for the actions where the record is
      // the control, fail the operation rather than complete it untraceably.
      logger.error(
        {
          err: error,
          action: entry.action,
          entityType: entry.entityType,
          userId: entry.userId,
          alert: "AUDIT_WRITE_FAILED",
        },
        "Failed to write audit log"
      );

      if (MUST_BE_RECORDED.some((prefix) => entry.action.includes(prefix))) {
        throw new Error(
          `Action '${entry.action}' was not completed: its audit record could not be written.`
        );
      }
    }
  }

  async search(params: {
    page: number;
    limit: number;
    userId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: Record<string, unknown> = {};

    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = { contains: params.action, mode: "insensitive" };
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;
    if (params.startDate || params.endDate) {
      where.timestamp = {
        ...(params.startDate && { gte: params.startDate }),
        ...(params.endDate && { lte: params.endDate }),
      };
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { displayName: true, email: true } } },
        orderBy: { timestamp: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }
}

export const auditService = new AuditService();
