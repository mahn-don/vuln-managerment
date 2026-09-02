import { prisma } from "@/lib/db/prisma";
import { auditService } from "@/modules/platform-services/services/audit.service";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { ValidationError, NotFoundError } from "@/lib/api/errors";
import type { Prisma } from "@/generated/prisma";
import { scopeApplicationWhere } from "@/modules/platform-services/middleware/abac.middleware";

export const POST = createHandler(
  async (req, context) => {
    const { id } = await context.params;

    const canAccessAllImports = ["SYSTEM_ADMIN", "SECURITY_ADMIN"].includes(context.user.role);
    const importRecord = await prisma.assetImport.findFirst({
      where: canAccessAllImports ? { id } : { id, importedById: context.user.id },
      include: { rows: { where: { isIncluded: true } } },
    });

    if (!importRecord) throw new NotFoundError("Import", id);
    if (importRecord.status !== "COMPLETED") {
      throw new ValidationError("Only completed imports can be rolled back");
    }

    // Check rollback window (24 hours)
    const rollbackWindow = 24 * 60 * 60 * 1000;
    if (importRecord.completedAt && Date.now() - importRecord.completedAt.getTime() > rollbackWindow) {
      throw new ValidationError("Rollback window has expired (24 hours)");
    }

    const applicationIds = [...new Set(importRecord.rows.flatMap((row) => row.applicationId ? [row.applicationId] : []))];
    const visibleCount = await prisma.application.count({
      where: scopeApplicationWhere(context.user, { id: { in: applicationIds } }),
    });
    if (visibleCount !== applicationIds.length) throw new NotFoundError("Application");

    let reverted = 0;
    let deleted = 0;
    const operations: Prisma.PrismaPromise<unknown>[] = [];

    for (const row of importRecord.rows) {
      if (row.status === "NEW" && row.applicationId) {
        // Delete newly created applications
        operations.push(prisma.application.update({
          where: { id: row.applicationId },
          data: { status: "ARCHIVED" },
        }));
        deleted++;
      } else if (row.status === "UPDATED" && row.applicationId && row.changes) {
        // Revert field changes
        const changes = row.changes as Record<string, { old: unknown; new: unknown }>;
        const revertData: Record<string, unknown> = {};

        for (const [field, change] of Object.entries(changes)) {
          revertData[field] = change.old;
        }

        operations.push(prisma.application.update({
          where: { id: row.applicationId },
          data: revertData as Prisma.ApplicationUpdateInput,
        }));
        reverted++;
      }
    }

    for (let offset = 0; offset < operations.length; offset += 100) {
      await prisma.$transaction(operations.slice(offset, offset + 100));
    }

    await prisma.assetImport.update({
      where: { id },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
    });

    await auditService.log({
      userId: context.user.id,
      action: "import.rollback",
      entityType: "import",
      entityId: id,
      details: { reverted, deleted, fileName: importRecord.fileName },
    });

    return successResponse({ reverted, deleted });
  },
  { permission: Permission.IMPORT_EXCEL }
);
