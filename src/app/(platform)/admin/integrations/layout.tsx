import { requirePermission } from "@/lib/auth/guard";
import { Permission } from "@/modules/platform-services/types/roles";

/** Integration credentials and sync control are administrative. */
export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(Permission.MANAGE_INTEGRATIONS);
  return <>{children}</>;
}
