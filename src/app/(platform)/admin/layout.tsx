import { requireAnyPermission } from "@/lib/auth/guard";
import { Permission } from "@/modules/platform-services/types/roles";

/**
 * The administration hub is worth opening if any one of its tools is usable —
 * a security manager owns SLA policy and inventory imports without being an
 * administrator. Each section re-checks its own permission underneath this.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAnyPermission([
    Permission.MANAGE_USERS,
    Permission.CONFIGURE_SYSTEM,
    Permission.VIEW_AUDIT_LOGS,
    Permission.MANAGE_INTEGRATIONS,
    Permission.CONFIGURE_SLA,
    Permission.IMPORT_EXCEL,
  ]);
  return <>{children}</>;
}
