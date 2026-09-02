import { prisma } from "@/lib/db/prisma";
import { createHandler, validateBody, successResponse, createdResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { z } from "zod/v4";
import { applicationService } from "@/modules/asset-management";

const createOwnerSchema = z.object({
  userId: z.string().uuid().optional(),
  ownerName: z.string().max(255).optional(),
  ownerEmail: z.string().email().optional(),
  ownerType: z.enum(["APPLICATION_OWNER", "TECHNICAL_OWNER", "SECURITY_OWNER"]),
  isPrimary: z.boolean().default(false),
});

export const GET = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    await applicationService.assertAccess(id, context.user);
    const owners = await prisma.applicationOwner.findMany({
      where: { applicationId: id },
      include: { user: { select: { displayName: true, email: true } } },
      orderBy: { ownerType: "asc" },
    });
    return successResponse(owners);
  },
  { permission: Permission.VIEW_ALL_APPLICATIONS }
);

export const POST = createHandler(
  async (req, context) => {
    const { id } = await context.params;
    await applicationService.assertAccess(id, context.user);
    const data = await validateBody(req, createOwnerSchema);
    const owner = await prisma.applicationOwner.create({
      data: { applicationId: id, ...data },
      include: { user: { select: { displayName: true, email: true } } },
    });
    return createdResponse(owner);
  },
  { permission: Permission.EDIT_APPLICATIONS }
);
