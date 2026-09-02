import { prisma } from "@/lib/db/prisma";
import { createHandler, successResponse } from "@/lib/api";

export const GET = createHandler(
  async (req, context) => {
    const user = await prisma.user.findUnique({
      where: { id: context.user.id },
      omit: { passwordHash: true },
      include: { businessUnit: { select: { name: true } } },
    });

    if (!user) return successResponse(null);

    return successResponse(user);
  }
);
