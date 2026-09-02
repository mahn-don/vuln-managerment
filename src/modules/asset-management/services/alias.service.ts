import { prisma } from "@/lib/db/prisma";
import { normalizeAppName } from "@/lib/utils/normalize";
import { auditService } from "@/modules/platform-services/services/audit.service";
import { NotFoundError, ConflictError } from "@/lib/api/errors";
import type { CreateAliasInput } from "../schemas/alias.schema";

class AliasService {
  async addAlias(applicationId: string, data: CreateAliasInput, userId: string) {
    // Verify application exists
    const app = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundError("Application", applicationId);

    const normalizedAlias = normalizeAppName(data.alias);

    // Check for duplicate alias on this application
    const existing = await prisma.applicationAlias.findUnique({
      where: {
        applicationId_normalizedAlias: {
          applicationId,
          normalizedAlias,
        },
      },
    });

    if (existing) {
      throw new ConflictError(`Alias '${data.alias}' already exists for this application`);
    }

    // Check if this alias is used by another application (warning scenario)
    const otherApp = await prisma.applicationAlias.findFirst({
      where: { normalizedAlias, applicationId: { not: applicationId } },
      include: { application: { select: { name: true } } },
    });

    const alias = await prisma.applicationAlias.create({
      data: {
        applicationId,
        alias: data.alias.trim(),
        normalizedAlias,
        source: data.source,
        createdById: userId,
      },
    });

    await auditService.log({
      userId,
      action: "alias.create",
      entityType: "application",
      entityId: applicationId,
      details: {
        alias: data.alias,
        source: data.source,
        conflictWarning: otherApp
          ? `Alias also exists on application: ${otherApp.application.name}`
          : undefined,
      },
    });

    return { alias, warning: otherApp ? `This alias is also used by '${otherApp.application.name}'` : undefined };
  }

  async removeAlias(aliasId: string, userId: string, applicationId?: string) {
    const alias = await prisma.applicationAlias.findFirst({
      where: { id: aliasId, ...(applicationId ? { applicationId } : {}) },
    });
    if (!alias) throw new NotFoundError("Alias", aliasId);

    await prisma.applicationAlias.delete({ where: { id: aliasId } });

    await auditService.log({
      userId,
      action: "alias.delete",
      entityType: "application",
      entityId: alias.applicationId,
      details: { alias: alias.alias },
    });
  }

  async getAliases(applicationId: string) {
    return prisma.applicationAlias.findMany({
      where: { applicationId },
      orderBy: { alias: "asc" },
    });
  }
}

export const aliasService = new AliasService();
