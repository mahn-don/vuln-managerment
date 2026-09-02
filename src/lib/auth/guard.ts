import { redirect } from "next/navigation";
import { auth } from "./options";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { landingFor } from "@/config/navigation";
import type { Role } from "@/config/navigation";

/**
 * Page-level authorization for server components.
 *
 * The sidebar already hides destinations a role cannot use, but hiding a link is
 * not authorization: typing /admin/users still rendered the screen, and the user
 * met an admin heading over a table that would 403. The APIs were never the hole
 * — this closes the door at the page instead of leaving a dead end behind it.
 */
export async function requirePermission(permission: Permission) {
  const session = await auth();
  const role = session?.user?.role as Role | undefined;

  if (!role || !hasPermission(role, permission)) {
    redirect(landingFor(role));
  }
  return session;
}

/** For hubs that are worth opening if any one of their tools is usable. */
export async function requireAnyPermission(permissions: Permission[]) {
  const session = await auth();
  const role = session?.user?.role as Role | undefined;

  if (!role || !permissions.some((permission) => hasPermission(role, permission))) {
    redirect(landingFor(role));
  }
  return session;
}
