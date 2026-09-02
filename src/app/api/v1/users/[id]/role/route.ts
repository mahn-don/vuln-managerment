import { prisma } from "@/lib/db/prisma";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { ValidationError } from "@/lib/api/errors";
import { Permission } from "@/modules/platform-services/types/roles";
import { auditService } from "@/modules/platform-services/services/audit.service";
import { z } from "zod/v4";

const updateRoleSchema = z.object({
  role: z.enum([
    "SYSTEM_ADMIN", "SECURITY_ADMIN", "SECURITY_MANAGER", "SECURITY_ENGINEER",
    "APPLICATION_OWNER", "DEVELOPER", "AUDITOR", "EXECUTIVE", "READ_ONLY",
  ]),
});

export const PUT = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    const { role } = await validateBody(req, updateRoleSchema);

    if (id === context.user.id) {
      throw new ValidationError("Cannot change your own role");
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return successResponse(null);

    const previousRole = user.role;

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      omit: { passwordHash: true },
    });

    await auditService.log({
      userId: context.user.id,
      action: "user.role_change",
      entityType: "user",
      entityId: id,
      details: { previousRole, newRole: role },
    });

    return successResponse(updated);
  },
  { permission: Permission.MANAGE_USERS }
);
