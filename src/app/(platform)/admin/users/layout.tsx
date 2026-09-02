import { requirePermission } from "@/lib/auth/guard";
import { Permission } from "@/modules/platform-services/types/roles";

/** User administration is limited to roles that may manage accounts. */
export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(Permission.MANAGE_USERS);
  return <>{children}</>;
}
