import { requirePermission } from "@/lib/auth/guard";
import { Permission } from "@/modules/platform-services/types/roles";

/** SLA policy: security managers own this, not only administrators. */
export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(Permission.CONFIGURE_SLA);
  return <>{children}</>;
}
