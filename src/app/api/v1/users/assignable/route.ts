import { prisma } from "@/lib/db/prisma";
import { createHandler, successResponse } from "@/lib/api";
import { UserRole } from "@/types/enums";

/** Roles that can hold an assessment or a finding. */
const ASSIGNABLE_ROLES = [
  UserRole.SECURITY_ENGINEER,
  UserRole.SECURITY_MANAGER,
  UserRole.SECURITY_ADMIN,
  UserRole.SYSTEM_ADMIN,
];

/**
 * Who work can be handed to.
 *
 * Deliberately not gated on MANAGE_USERS: assigning is not user administration,
 * and gating it there left a security manager — whose whole role is directing
 * work — with an assignee menu that returned 403 and rendered empty. Only the
 * fields a picker needs are returned; no emails, no account state.
 */
export const GET = createHandler(async () => {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ASSIGNABLE_ROLES } },
    select: { id: true, displayName: true, role: true },
    orderBy: { displayName: "asc" },
  });

  return successResponse(users);
});
