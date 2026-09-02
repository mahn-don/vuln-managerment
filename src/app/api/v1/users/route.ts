import { prisma } from "@/lib/db/prisma";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;

    const where = search
      ? {
          OR: [
            { displayName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const users = await prisma.user.findMany({
      where,
      omit: { passwordHash: true },
      include: { businessUnit: { select: { name: true } } },
      orderBy: { displayName: "asc" },
      take: 100,
    });

    return successResponse(users);
  },
  { permission: Permission.MANAGE_USERS }
);
