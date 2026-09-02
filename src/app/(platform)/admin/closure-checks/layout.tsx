import { requirePermission } from "@/lib/auth/guard";
import { Permission } from "@/modules/platform-services/types/roles";

/** Defining what a ticket must contain before closure is system configuration. */
export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(Permission.CONFIGURE_SYSTEM);
  return <>{children}</>;
}
